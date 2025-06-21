import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { logger } from "@trigger.dev/sdk/v3";
import { createAppAuth } from "@octokit/auth-app";
import { safeGitCommit, hasStageChanges, getStagedDiff, setGitUser, getRepositoryStructure, getRepositoryStructureAsync, safeGitCommand, safeGitPushWithRetry } from "./git-utils";
import { generateCommitMessage, generateCodeChanges } from "./openai-operations";
import { processSearchReplaceBlocks } from "./file-operations";

// Constants for regex patterns and delimiters
const REGEX_PATTERNS = {
  // Search/Replace block patterns
  SEARCH_REPLACE_BLOCK: /```search-replace\n([\s\S]*?)```/g,
  SEARCH_REPLACE_PAIRS: /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g,
  
  // File and code block patterns
  FILE_PATH: /FILE:\s*(.*)/,
  FILE_DECLARATION: /^FILE:\s*(.*)$/gm,
  CODE_BLOCK: /```(\w+)?\n([\s\S]*?)```/g,
  CODE_MARKERS: /```/g,
  
  // Text normalization patterns
  CARRIAGE_RETURN: /\r\n/g,
  MAC_RETURN: /\r/g,
  EXCESSIVE_NEWLINES: /\n{4,}/g,
  MULTIPLE_NEWLINES: /\n{3,}/g,
  TRAILING_WHITESPACE: /[ \t]+$/gm,
  UNICODE_SPACES: /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g,
  ZERO_WIDTH_CHARS: /[\u200B-\u200D\uFEFF]/g,
  
  // Code structure patterns
  OPEN_BRACES: /{/g,
  CLOSE_BRACES: /}/g,
  
  // Security patterns
  EVAL_USAGE: /eval\s*\(/i,
  EXEC_USAGE: /exec\s*\(/i,
  SYSTEM_USAGE: /system\s*\(/i,
  DANGEROUS_RM: /rm\s+-rf/i,
  SUDO_USAGE: /sudo\s+/i,
  PASSWD_ACCESS: /passwd|shadow/i,
  PROCESS_EXIT: /process\.exit/i,
  
  // Dangerous command removal patterns
  DANGEROUS_RM_COMMAND: /rm\s+-rf[^\n]*/gi,
  DANGEROUS_SUDO_RM: /sudo\s+rm[^\n]*/gi,
  DANGEROUS_EVAL_COMMAND: /eval\s*\([^)]*\)/gi,
  DANGEROUS_EXEC_COMMAND: /exec\s*\([^)]*\)/gi,
  
  // Formatting patterns
  HEADING_SPACING: /^(#+)([^\s#])/gm,
  LIST_SPACING: /^(\s*[-*+])\s*([^\s])/gm,
  CODE_BLOCK_LANG: /^```(\w+)?\n/gm,
  JS_TS_CODE_BLOCKS: /```(typescript|javascript|ts|js|tsx|jsx)\n([\s\S]*?)```/g,
  
  // Delimiters and markers
  SEARCH_MARKER: /^<<<<<<< SEARCH$/gm,
  SEPARATOR_MARKER: /^=======$/gm,
  REPLACE_MARKER: /^>>>>>>> REPLACE$/gm,
  
  // Protocol patterns
  HTTP_PROTOCOL: /^https?:\/\//,
  NEWLINE_ESCAPE: /\\n/g
} as const;

const DANGEROUS_PATTERNS = [
  { pattern: REGEX_PATTERNS.EVAL_USAGE, desc: "eval() usage detected" },
  { pattern: REGEX_PATTERNS.EXEC_USAGE, desc: "exec() usage detected" },
  { pattern: REGEX_PATTERNS.SYSTEM_USAGE, desc: "system() usage detected" },
  { pattern: REGEX_PATTERNS.DANGEROUS_RM, desc: "Dangerous file deletion command" },
  { pattern: REGEX_PATTERNS.SUDO_USAGE, desc: "Privilege escalation command" }
] as const;

/**
 * Helper class for managing string replacements with automatic offset tracking.
 */
class StringPatcher {
  private content: string;
  private offset: number = 0;

  constructor(content: string) {
    this.content = content;
  }

  /**
   * Replace a section of the string and automatically track offset changes.
   */
  replaceAt(index: number, length: number, replacement: string): void {
    const adjustedIndex = index + this.offset;
    this.content = this.content.substring(0, adjustedIndex) +
                   replacement +
                   this.content.substring(adjustedIndex + length);
    this.offset += replacement.length - length;
  }

  /**
   * Get the current content with all patches applied.
   */
  getContent(): string {
    return this.content;
  }

  /**
   * Get the current offset value.
   */
  getOffset(): number {
    return this.offset;
  }
}

/**
 * Result interface for code generation operations.
 * Distinguishes between successful code changes and error responses.
 */
export interface CodeGenerationResult {
  success: boolean;
  responses: string[];
  isErrorFallback: boolean;
  errorMessage?: string;
  changesApplied?: number;
}

/**
 * Clone a repository, run OpenAI API in a self-ask flow by repeatedly sending prompts,
 * commit & push changes.
 *
 * The self-ask flow repeatedly sends the current prompt to the OpenAI API until no new reply is generated.
 * It includes an evaluator-optimizer to refine responses and a search & replace tool to apply changes.
 *
 * @param prompt - The initial prompt for OpenAI.
 * @param repoUrl - HTTPS clone URL of the repository.
 * @param branchName - Name of the branch to create and push.
 * @param installationId - Optional GitHub App installation ID for authentication.
 * @returns Local path to the cloned repository.
 */
export async function codexRepository(
  prompt: string,
  repoUrl: string,
  branchName: string,
  installationId?: string
): Promise<string> {
  try {
    logger.log("codexRepository start", { repoUrl, branchName });

    // Create temporary workspace
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "repo-"));
    logger.log("created temp dir", { tempDir });

    // Prepare authenticated URL if GitHub App creds are provided
    let cloneUrl = repoUrl;
    if (process.env.GITHUB_APP_ID && process.env.GITHUB_PRIVATE_KEY && installationId) {
      try {
        const auth = createAppAuth({
          appId: parseInt(process.env.GITHUB_APP_ID, 10),
          privateKey: process.env.GITHUB_PRIVATE_KEY.replace(REGEX_PATTERNS.NEWLINE_ESCAPE, "\n"),
        });
        const installation = await auth({
          type: "installation",
          installationId: parseInt(installationId, 10),
        });
        const originHost = repoUrl.replace(REGEX_PATTERNS.HTTP_PROTOCOL, "");
        cloneUrl = `https://x-access-token:${installation.token}@${originHost}`;
        logger.log("using authenticated GitHub URL");
      } catch (err) {
        logger.warn("GitHub authentication failed, using original URL", { error: (err as Error).message });
      }
    }

    // Clone the repository and checkout branch using safe git commands
    safeGitCommand(['clone', cloneUrl, tempDir], { cwd: process.cwd(), stdio: 'inherit' });
    safeGitCommand(['checkout', '-b', branchName], { cwd: tempDir, stdio: 'inherit' });

    // Set Git identity using safe utilities
    setGitUser(tempDir, "bot@larp.dev", "larp0");

    // Use @openai/codex CLI to process the repository
    let generationResult: CodeGenerationResult;
    try {
      generationResult = await runCodexGeneration(prompt, tempDir);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Codex CLI generation failed", { error: errorMessage });
      
      // Return error result with clear metadata
      generationResult = {
        success: false,
        responses: [],
        isErrorFallback: true,
        errorMessage: `Codex CLI failed: ${errorMessage}`
      };
    }
    
    let totalChangesApplied = 0;
    
    if (generationResult.success && generationResult.responses.length > 0) {
      logger.log("Codex CLI generation completed", { responsesCount: generationResult.responses.length });
      
      // Process search/replace operations from all responses
      for (let i = 0; i < generationResult.responses.length; i++) {
        const response = generationResult.responses[i];
        logger.log("Processing response", { index: i + 1, responseLength: response.length });
        
        // Run evaluator-optimizer on the reply
        const optimizedReply = evaluateAndOptimize(response, tempDir);
        logger.log("Evaluated and optimized reply", {
          iteration: i + 1,
          originalLength: response.length,
          optimizedLength: optimizedReply.length
        });

        // Process any search/replace blocks in the reply
        const searchReplaceChanges = processSearchReplaceBlocks(optimizedReply, tempDir);
        const successfulChanges = searchReplaceChanges.filter(change => change.applied).length;
        totalChangesApplied += successfulChanges;
        
        if (searchReplaceChanges.length > 0) {
          logger.log("Applied search/replace operations", {
            iteration: i + 1,
            changesCount: searchReplaceChanges.length,
            successfulChanges,
            changes: searchReplaceChanges
          });
        }
      }
      
      // Update the generation result with actual changes applied
      generationResult.changesApplied = totalChangesApplied;
    } else if (generationResult.isErrorFallback) {
      logger.error("Codex CLI generation failed, no changes will be applied", { 
        errorMessage: generationResult.errorMessage 
      });
    } else {
      logger.log("No responses generated from Codex CLI");
    }

    // Commit and push changes using safe git utilities
    safeGitCommand(['add', '.'], { cwd: tempDir, stdio: 'inherit' });
    
    // Check if there are any changes to commit
    const hasChanges = hasStageChanges(tempDir);
    
    // Generate AI commit message based on success/failure and actual changes
    let commitMessage: string;
    if (generationResult.isErrorFallback) {
      commitMessage = `Codex CLI failed: ${generationResult.errorMessage?.split(':')[1]?.trim() || 'Unknown error'}`;
    } else {
      const diffContent = hasChanges ? getStagedDiff(tempDir) : '';
      commitMessage = hasChanges 
        ? await generateCommitMessage(diffContent)
        : `Codex CLI completed (${totalChangesApplied} changes applied)`;
    }
    
    // Use safe git commit that prevents shell injection
    await safeGitCommit(commitMessage, {
      cwd: tempDir,
      allowEmpty: !hasChanges
    });
    
    // Push with retry and backoff for resilience
    await safeGitPushWithRetry(tempDir, branchName);

    return tempDir;
  } catch (err: unknown) {
    let msg: string;
    if (err instanceof Error && err.message) {
      msg = err.message;
    } else if (typeof err === 'string') {
      msg = err;
    } else {
      msg = 'Unknown error';
    }
    logger.error("codexRepository failed", { error: msg, repoUrl, branchName });
    throw new Error(`Error processing repository ${repoUrl}: ${msg}. Please check repository settings and try again.`);
  }
}

/**
 * Sanitize prompt strings to prevent shell injection attacks.
 * Removes or escapes shell special characters that could be exploited.
 * 
 * @param input - The input string to sanitize
 * @returns Sanitized string safe for shell execution
 */
function sanitizePrompt(input: string): string {
  if (!input) return '';
  
  // Remove or escape potentially dangerous shell characters
  return input
    .replace(/[`$(){}[\]|&;<>]/g, '') // Remove shell special characters
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/'/g, "\\'") // Escape single quotes
    .trim();
}

/**
 * Execute a command using spawn for security (prevents command injection).
 * 
 * @param command - Command to execute
 * @param args - Arguments array
 * @param options - Spawn options
 * @returns Promise that resolves to the command output
 */
function executeCommand(command: string, args: string[], options: Record<string, unknown> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Run the @openai/codex CLI tool to process code generation requests.
 * Uses the official Codex CLI with codex-mini-latest model for enhanced code generation.
 * SECURITY: Uses spawn with args array to prevent command injection attacks.
 * 
 * @param prompt - The initial prompt for code generation.
 * @param repositoryContext - Repository context information.
 * @param repoPath - Path to the repository directory.
 * @returns Generated response from the CLI tool.
 */
async function runCodexCLI(prompt: string, repositoryContext: string, repoPath: string): Promise<string> {
  try {
    logger.log("Running @openai/codex CLI tool", { 
      promptLength: prompt.length,
      contextLength: repositoryContext.length,
      repoPath 
    });

    // Sanitize inputs to prevent shell injection
    const sanitizedPrompt = sanitizePrompt(prompt);
    const sanitizedContext = sanitizePrompt(repositoryContext);
    const sanitizedRepoPath = sanitizePrompt(repoPath);

    // Prepare the enhanced prompt with repository context
    const enhancedPrompt = sanitizedContext 
      ? `REPOSITORY CONTEXT:\n${sanitizedContext}\n\nUSER REQUEST:\n${sanitizedPrompt}\n\nPlease generate the necessary code changes using SEARCH/REPLACE blocks.`
      : `USER REQUEST:\n${sanitizedPrompt}\n\nPlease generate the necessary code changes using SEARCH/REPLACE blocks.`;

    // Execute the @openai/codex CLI tool using secure spawn with args array
    // This prevents command injection by treating each argument separately
    const args = [
      '@openai/codex', 'exec', 
      '--model', 'codex-mini-latest',
      '--full-auto',
      '--cd', sanitizedRepoPath,
      enhancedPrompt
    ];
    
    logger.log("Executing @openai/codex CLI", { 
      command: 'npx',
      args: args.slice(0, -1).concat(['[PROMPT_REDACTED]']) // Log without full prompt for security
    });
    
    const response = await executeCommand('npx', args, {
      encoding: 'utf-8',
      env: {
        ...process.env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY
      },
      timeout: 300000 // 5 minutes timeout
    });

    logger.log("@openai/codex CLI completed successfully", { 
      responseLength: response.length 
    });

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("@openai/codex CLI failed", { error: errorMessage });
    throw new Error(`@openai/codex CLI failed: ${errorMessage}`);
  }
}

/**
 * Run the @openai/codex CLI to process the repository.
 * Uses the official Codex CLI with codex-mini-latest model for enhanced code generation.
 * @param prompt - The initial prompt for code generation.
 * @param repoPath - Path to the repository directory.
 * @returns CodeGenerationResult with success status and metadata.
 */
async function runCodexGeneration(prompt: string, repoPath: string): Promise<CodeGenerationResult> {
  try {
    logger.log("Running code generation with @openai/codex CLI", { promptLength: prompt.length, repoPath });
    
    // Get repository context for better code generation
    let repositoryContext = '';
    try {
      // Use async version for better performance with large repositories
      repositoryContext = await getRepositoryStructureAsync(repoPath);
      logger.log("Repository context gathered", { contextLength: repositoryContext.length });
    } catch (error) {
      logger.warn("Failed to gather repository context", { error: String(error) });
      // Fallback to synchronous version as last resort
      try {
        repositoryContext = getRepositoryStructure(repoPath);
        logger.log("Repository context gathered (fallback)", { contextLength: repositoryContext.length });
      } catch (fallbackError) {
        logger.warn("Both async and sync repository context gathering failed", { 
          asyncError: String(error),
          syncError: String(fallbackError)
        });
        // Continue without context - the CLI can still work
      }
    }
    
    // Generate code changes using @openai/codex CLI
    const response = await runCodexCLI(prompt, repositoryContext, repoPath);
    
    logger.log("Codex CLI generation completed", { 
      responseLength: response.length,
      hasSearchReplace: response.includes('search-replace')
    });
    
    // Return successful result with actual code changes
    return {
      success: true,
      responses: response.trim() ? [response.trim()] : [],
      isErrorFallback: false,
      changesApplied: 0 // Will be updated later after processing search/replace blocks
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error("Codex CLI generation failed", { 
      error: errorMessage,
      promptLength: prompt.length
    });
    
    // Return error result with metadata to differentiate from real code changes
    return {
      success: false,
      responses: [],
      isErrorFallback: true,
      errorMessage: `Codex CLI failed: ${errorMessage}`
    };
  }
}

/**
 * Enhanced evaluation and optimization of AI responses.
 * Includes comprehensive code block validation, safe formatting improvements, and AST-ready extension points.
 * @param reply - The reply from OpenAI API.
 * @param repoPath - Path to the repository for context.
 * @returns Optimized and validated reply.
 */
function evaluateAndOptimize(reply: string, repoPath: string): string {
  // Input validation and early return
  if (!reply || typeof reply !== 'string') {
    logger.warn("Invalid reply input for optimization", { replyType: typeof reply });
    return '';
  }
  
  logger.log("Starting response optimization", { 
    originalLength: reply.length,
    repoPath: path.basename(repoPath)
  });
  
  // Phase 1: Basic normalization and cleanup
  let optimizedReply = normalizeContent(reply);
  
  // Phase 2: Advanced code block validation and optimization
  optimizedReply = validateAndOptimizeCodeBlocks(optimizedReply, repoPath);
  
  // Phase 3: Content validation and safety checks
  const safetyCheck = performSafetyValidation(optimizedReply);
  if (!safetyCheck.isSafe) {
    logger.error("Response failed safety validation", {
      issues: safetyCheck.issues,
      severity: safetyCheck.severity
    });
    
    if (safetyCheck.severity === 'critical') {
      return generateSafeErrorResponse(safetyCheck.issues);
    }
    
    // Apply safety filters for non-critical issues
    optimizedReply = applySafetyFilters(optimizedReply, safetyCheck.issues);
  }
  
  // Phase 4: Content quality and structure optimization
  optimizedReply = optimizeContentStructure(optimizedReply, repoPath);
  
  // Phase 5: Future-ready optimization hooks
  optimizedReply = applyAdvancedOptimizations(optimizedReply, repoPath);
  
  // Final validation and metrics
  const finalValidation = validateFinalOutput(optimizedReply, reply);
  
  logger.log("Response optimization completed", {
    originalLength: reply.length,
    optimizedLength: optimizedReply.length,
    reductionRatio: ((reply.length - optimizedReply.length) / reply.length * 100).toFixed(2) + '%',
    qualityScore: finalValidation.qualityScore,
    issues: finalValidation.issues.length
  });
  
  if (finalValidation.issues.length > 0) {
    logger.warn("Final validation detected issues", { issues: finalValidation.issues });
  }
  
  return optimizedReply;
}

/**
 * Normalize content with safe text processing operations.
 */
function normalizeContent(content: string): string {
  return content
    // Normalize line endings to Unix format
    .replace(REGEX_PATTERNS.CARRIAGE_RETURN, '\n')
    .replace(REGEX_PATTERNS.MAC_RETURN, '\n')
    // Normalize excessive whitespace while preserving code formatting
    .replace(REGEX_PATTERNS.EXCESSIVE_NEWLINES, '\n\n\n')
    // Remove trailing whitespace from lines but preserve intentional indentation
    .replace(REGEX_PATTERNS.TRAILING_WHITESPACE, '')
    // Normalize Unicode whitespace characters
    .replace(REGEX_PATTERNS.UNICODE_SPACES, ' ')
    // Remove zero-width characters that could cause issues
    .replace(REGEX_PATTERNS.ZERO_WIDTH_CHARS, '')
    // Trim overall content
    .trim();
}

/**
 * Enhanced validation and optimization of code blocks within AI responses.
 * @param reply - The AI response containing potential code blocks.
 * @param repoPath - Repository path for context validation.
 * @returns Optimized reply with validated and improved code blocks.
 */
function validateAndOptimizeCodeBlocks(reply: string, repoPath: string): string {
  try {
    logger.log("Validating and optimizing code blocks", { 
      replyLength: reply.length,
      hasSearchReplace: reply.includes('search-replace')
    });
    
    let optimizedReply = reply;
    
    // Enhanced search-replace block processing
    optimizedReply = optimizeSearchReplaceBlocks(optimizedReply, repoPath);
    
    // Process other code block types
    optimizedReply = processGenericCodeBlocks(optimizedReply);
    
    // Validate code block consistency
    optimizedReply = validateCodeBlockStructure(optimizedReply);
    
    return optimizedReply;
    
  } catch (error) {
    logger.error("Error in code block validation", {
      error: error instanceof Error ? error.message : String(error),
      replyLength: reply.length
    });
    return reply; // Return original on error to avoid data loss
  }
}

/**
 * Process and validate search-replace blocks with enhanced security and structure checks.
 */
function optimizeSearchReplaceBlocks(reply: string, repoPath: string): string {
  const patcher = new StringPatcher(reply);
  
  // Reset regex state
  REGEX_PATTERNS.SEARCH_REPLACE_BLOCK.lastIndex = 0;
  
  const matches = [];
  let match;
  while ((match = REGEX_PATTERNS.SEARCH_REPLACE_BLOCK.exec(reply)) !== null) {
    matches.push(match);
  }
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const fullBlock = match[0];
    const blockContent = match[1];
    const matchIndex = match.index!;
    
    // Comprehensive validation of the search-replace block
    const validation = validateSearchReplaceStructure(blockContent, repoPath);
    
    logger.log("Search-replace block validation", {
      blockIndex: i,
      isValid: validation.isValid,
      errorsCount: validation.errors.length,
      warningsCount: validation.warnings.length
    });
    
    if (!validation.isValid) {
      const errorDetails = validation.errors.join('; ');
      logger.warn("Invalid search-replace block detected and removed", {
        errors: validation.errors,
        blockPreview: blockContent.substring(0, 200) + (blockContent.length > 200 ? '...' : '')
      });
      
      // Replace with informative comment
      const errorComment = `<!-- INVALID SEARCH-REPLACE BLOCK REMOVED\nErrors: ${errorDetails}\nOriginal content preserved but not executable.\n-->`;
      
      patcher.replaceAt(matchIndex, fullBlock.length, errorComment);
    } else {
      // Optimize valid blocks
      const optimizedBlock = optimizeSearchReplaceBlock(blockContent, validation);
      
      if (optimizedBlock !== blockContent) {
        const newFullBlock = '```search-replace\n' + optimizedBlock + '```';
        
        patcher.replaceAt(matchIndex, fullBlock.length, newFullBlock);
        
        logger.log("Search-replace block optimized", {
          originalLength: blockContent.length,
          optimizedLength: optimizedBlock.length
        });
      }
      
      // Log warnings for valid but concerning blocks
      if (validation.warnings.length > 0) {
        logger.warn("Search-replace block warnings", {
          warnings: validation.warnings,
          blockPreview: blockContent.substring(0, 100) + (blockContent.length > 100 ? '...' : '')
        });
      }
    }
  }
  
  return patcher.getContent();
}

/**
 * Optimize a valid search-replace block for better formatting and safety.
 */
function optimizeSearchReplaceBlock(blockContent: string, validation: any): string {
  let optimized = blockContent;
  
  // Normalize whitespace while preserving code structure
  optimized = optimized.replace(REGEX_PATTERNS.MULTIPLE_NEWLINES, '\n\n');
  
  // Ensure proper FILE declaration format
  optimized = optimized.replace(REGEX_PATTERNS.FILE_DECLARATION, 'FILE: $1');
  
  // Ensure proper search/replace delimiters
  optimized = optimized.replace(REGEX_PATTERNS.SEARCH_MARKER, '<<<<<<< SEARCH');
  optimized = optimized.replace(REGEX_PATTERNS.SEPARATOR_MARKER, '=======');
  optimized = optimized.replace(REGEX_PATTERNS.REPLACE_MARKER, '>>>>>>> REPLACE');
  
  return optimized;
}

/**
 * Process and validate generic code blocks (non-search-replace).
 */
function processGenericCodeBlocks(reply: string): string {
  // Match various code block formats
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const processedReply = reply;
  
  const codeBlocks = [];
  let match;
  while ((match = codeBlockRegex.exec(reply)) !== null) {
    codeBlocks.push(match);
  }
  
  for (const match of codeBlocks) {
    const language = match[1] || 'text';
    const codeContent = match[2];
    
    // Skip search-replace blocks (handled separately)
    if (language === 'search-replace') {
      continue;
    }
    
    // Basic validation for code blocks
    const issues = validateCodeContent(codeContent, language);
    
    if (issues.length > 0) {
      logger.warn("Code block validation issues", {
        language,
        issues,
        contentPreview: codeContent.substring(0, 100) + (codeContent.length > 100 ? '...' : '')
      });
    }
  }
  
  return processedReply;
}

/**
 * Validate code content for potential issues.
 */
function validateCodeContent(content: string, language: string): string[] {
  const issues: string[] = [];
  
  // Check for suspicious patterns
  const suspiciousPatterns = DANGEROUS_PATTERNS;
  
  for (const { pattern, desc } of suspiciousPatterns) {
    if (pattern.test(content)) {
      issues.push(desc);
    }
  }
  
  // Language-specific validations
  switch (language.toLowerCase()) {
    case 'javascript':
    case 'typescript':
    case 'js':
    case 'ts':
      // Check for basic syntax issues
      const jsIssues = validateJavaScriptCode(content);
      issues.push(...jsIssues);
      break;
      
    case 'json':
      try {
        JSON.parse(content);
      } catch (e) {
        issues.push("Invalid JSON syntax");
      }
      break;
  }
  
  return issues;
}

/**
 * Validate JavaScript/TypeScript code for common issues.
 */
function validateJavaScriptCode(content: string): string[] {
  const issues: string[] = [];
  
  // Check bracket balance
  const openBraces = (content.match(REGEX_PATTERNS.OPEN_BRACES) || []).length;
  const closeBraces = (content.match(REGEX_PATTERNS.CLOSE_BRACES) || []).length;
  
  if (openBraces !== closeBraces) {
    issues.push("Unbalanced curly braces");
  }
  
  // Check for unclosed strings (basic check)
  const lines = content.split('\n');
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const char = line[j];
      const prevChar = j > 0 ? line[j - 1] : '';
      
      if (!inString && (char === '"' || char === "'" || char === '`')) {
        inString = true;
        stringChar = char;
      } else if (inString && char === stringChar && prevChar !== '\\') {
        inString = false;
        stringChar = '';
      }
    }
  }
  
  if (inString) {
    issues.push("Possibly unclosed string literal");
  }
  
  return issues;
}

/**
 * Validate overall code block structure consistency.
 */
function validateCodeBlockStructure(reply: string): string {
  // Check for orphaned code block markers
  const openMarkers = (reply.match(REGEX_PATTERNS.CODE_MARKERS) || []).length;
  
  if (openMarkers % 2 !== 0) {
    logger.warn("Unbalanced code block markers detected", { totalMarkers: openMarkers });
    
    // Attempt to fix by adding closing marker if needed
    if (reply.endsWith('```')) {
      return reply;
    } else {
      return reply + '\n```';
    }
  }
  
  return reply;
}

/**
 * Perform comprehensive safety validation of the response content.
 */
function performSafetyValidation(content: string): { 
  isSafe: boolean; 
  issues: string[]; 
  severity: 'low' | 'medium' | 'high' | 'critical' 
} {
  const issues: string[] = [];
  let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  
  // Critical security patterns
  const criticalPatterns = [
    { pattern: /rm\s+-rf\s+\//, desc: "Root filesystem deletion", severity: 'critical' as const },
    { pattern: /sudo\s+rm\s+-rf/, desc: "Privileged file deletion", severity: 'critical' as const },
    { pattern: /\/dev\/null/g, desc: "System device access", severity: 'high' as const },
    { pattern: /passwd|shadow/i, desc: "Password file access", severity: 'critical' as const }
  ];
  
  // High-risk patterns
  const highRiskPatterns = [
    { pattern: /eval\s*\(/i, desc: "Code evaluation", severity: 'high' as const },
    { pattern: /exec\s*\(/i, desc: "Command execution", severity: 'high' as const },
    { pattern: /system\s*\(/i, desc: "System command", severity: 'high' as const },
    { pattern: /shell_exec/i, desc: "Shell execution", severity: 'high' as const }
  ];
  
  // Medium-risk patterns
  const mediumRiskPatterns = [
    { pattern: /process\.exit/i, desc: "Process termination", severity: 'medium' as const },
    { pattern: /document\.cookie/i, desc: "Cookie access", severity: 'medium' as const },
    { pattern: /localStorage/i, desc: "Local storage access", severity: 'medium' as const }
  ];
  
  const allPatterns = [...criticalPatterns, ...highRiskPatterns, ...mediumRiskPatterns];
  
  for (const { pattern, desc, severity } of allPatterns) {
    if (pattern.test(content)) {
      issues.push(`${severity.toUpperCase()}: ${desc}`);
      if (severity === 'critical' || (severity === 'high' && maxSeverity !== 'critical') || 
          (severity === 'medium' && maxSeverity === 'low')) {
        maxSeverity = severity;
      }
    }
  }
  
  return {
    isSafe: issues.length === 0,
    issues,
    severity: maxSeverity
  };
}

/**
 * Generate a safe error response when critical issues are detected.
 */
function generateSafeErrorResponse(issues: string[]): string {
  return `# Security Validation Failed

The AI response contained critical security issues and has been filtered for safety:

${issues.map(issue => `- ${issue}`).join('\n')}

Please review the original request and consider:
1. Using more specific and secure prompts
2. Avoiding system-level operations
3. Focusing on application-level code changes

For assistance, please contact the development team.`;
}

/**
 * Apply safety filters to remove or neutralize problematic content.
 */
function applySafetyFilters(content: string, issues: string[]): string {
  let filtered = content;
  
  // Remove or comment out dangerous command patterns
  const dangerousCommands = [
    REGEX_PATTERNS.DANGEROUS_RM_COMMAND,
    REGEX_PATTERNS.DANGEROUS_SUDO_RM,
    REGEX_PATTERNS.DANGEROUS_EVAL_COMMAND,
    REGEX_PATTERNS.DANGEROUS_EXEC_COMMAND
  ];
  
  for (const pattern of dangerousCommands) {
    filtered = filtered.replace(pattern, (match) => {
      return `<!-- DANGEROUS COMMAND FILTERED: ${match} -->`;
    });
  }
  
  return filtered;
}

/**
 * Optimize content structure for better readability and parsing.
 */
function optimizeContentStructure(content: string, repoPath: string): string {
  let optimized = content;
  
  // Ensure proper heading hierarchy
  optimized = normalizeHeadings(optimized);
  
  // Optimize code block formatting
  optimized = optimizeCodeBlockFormatting(optimized);
  
  // Ensure proper list formatting
  optimized = normalizeListFormatting(optimized);
  
  return optimized;
}

/**
 * Normalize markdown heading structure.
 */
function normalizeHeadings(content: string): string {
  // Ensure there's space after heading markers
  return content.replace(REGEX_PATTERNS.HEADING_SPACING, '$1 $2');
}

/**
 * Optimize code block formatting for consistency.
 */
function optimizeCodeBlockFormatting(content: string): string {
  // Ensure code blocks have proper language tags
  return content.replace(REGEX_PATTERNS.CODE_BLOCK_LANG, (match, lang) => {
    if (!lang) {
      return '```text\n';
    }
    return match;
  });
}

/**
 * Normalize list formatting for consistency.
 */
function normalizeListFormatting(content: string): string {
  // Ensure consistent list item spacing
  return content.replace(REGEX_PATTERNS.LIST_SPACING, '$1 $2');
}

/**
 * Apply advanced optimizations with extension points for future AST-based improvements.
 */
function applyAdvancedOptimizations(reply: string, repoPath: string): string {
  // Extension point for AST-based optimizations
  reply = prepareForASTOptimizations(reply);
  
  // Apply context-aware optimizations
  reply = applyContextAwareOptimizations(reply, repoPath);
  
  // Remove obviously malformed content patterns
  reply = removeMalformedPatterns(reply);
  
  return reply;
}

/**
 * Prepare content for future AST-based optimizations.
 */
function prepareForASTOptimizations(content: string): string {
  // Mark code blocks that could benefit from AST analysis
  const astCandidates = ['typescript', 'javascript', 'ts', 'js', 'tsx', 'jsx'];
  
  return content.replace(REGEX_PATTERNS.JS_TS_CODE_BLOCKS, 
    (match, lang, code) => {
      // Add metadata for future AST processing
      return `<!-- AST-READY: ${lang} -->\n${match}\n<!-- /AST-READY -->`;
    }
  );
}

/**
 * Apply repository context-aware optimizations.
 */
function applyContextAwareOptimizations(content: string, repoPath: string): string {
  // Future extension point for:
  // - Repository-specific pattern recognition
  // - Framework-specific optimizations
  // - Project structure-aware improvements
  
  logger.log("Context-aware optimization placeholder", { 
    repoPath: path.basename(repoPath),
    contentLength: content.length
  });
  
  return content;
}

/**
 * Remove obviously malformed patterns with safer detection.
 */
function removeMalformedPatterns(content: string): string {
  const lines = content.split('\n');
  const cleanedLines = lines.filter(line => {
    const trimmedLine = line.trim();
    
    // Remove lines that are clearly malformed artifacts
    const malformedPatterns = [
      /^={7,}$/, // Lines with only equals signs
      /^<{7,}$/, // Lines with only less-than signs  
      /^>{7,}$/, // Lines with only greater-than signs
      /^-{20,}$/, // Excessive dashes
      /^\+{20,}$/, // Excessive plus signs
      /^#{10,}$/, // Excessive hash symbols
    ];
    
    return !malformedPatterns.some(pattern => pattern.test(trimmedLine));
  });
  
  return cleanedLines.join('\n');
}

/**
 * Validate the final optimized output for quality and consistency.
 */
function validateFinalOutput(optimizedContent: string, originalContent: string): {
  qualityScore: number;
  issues: string[];
} {
  const issues: string[] = [];
  let qualityScore = 100;
  
  // Check for excessive reduction
  const reductionRatio = (originalContent.length - optimizedContent.length) / originalContent.length;
  if (reductionRatio > 0.5) {
    issues.push("Excessive content reduction (>50%)");
    qualityScore -= 20;
  }
  
  // Check for structural integrity
  if (optimizedContent.length < 10 && originalContent.length > 100) {
    issues.push("Output too short compared to input");
    qualityScore -= 30;
  }
  
  // Check for code block balance
  const codeBlockMarkers = (optimizedContent.match(REGEX_PATTERNS.CODE_MARKERS) || []).length;
  if (codeBlockMarkers % 2 !== 0) {
    issues.push("Unbalanced code block markers");
    qualityScore -= 15;
  }
  
  // Check for search-replace block presence if expected
  if (originalContent.includes('search-replace') && !optimizedContent.includes('search-replace')) {
    issues.push("Search-replace blocks were removed");
    qualityScore -= 25;
  }
  
  return {
    qualityScore: Math.max(0, qualityScore),
    issues
  };
}



/**
 * Validate the structure of a search-replace block.
 * @param blockContent - Content of the search-replace block.
 * @param repoPath - Repository path for file existence validation.
 * @returns Validation result with errors and warnings.
 */
function validateSearchReplaceStructure(
  blockContent: string, 
  repoPath: string
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    // Check for FILE declaration
    const fileMatch = blockContent.match(REGEX_PATTERNS.FILE_PATH);
    if (!fileMatch) {
      errors.push("Missing FILE declaration");
      return { isValid: false, errors, warnings };
    }

    const filePath = fileMatch[1].trim();
    if (!filePath) {
      errors.push("Empty file path");
      return { isValid: false, errors, warnings };
    }

    // Validate file path safety
    if (filePath.includes('..')) {
      errors.push("File path contains directory traversal");
    }

    // Check if file exists (warning, not error)
    const fullPath = path.join(repoPath, filePath);
    if (!fs.existsSync(fullPath)) {
      warnings.push(`File does not exist: ${filePath}`);
    }

    // Check for SEARCH/REPLACE pairs
    // Reset regex state and find pairs
    REGEX_PATTERNS.SEARCH_REPLACE_PAIRS.lastIndex = 0;
    const operations = [];
    let operationMatch;

    while ((operationMatch = REGEX_PATTERNS.SEARCH_REPLACE_PAIRS.exec(blockContent)) !== null) {
      operations.push({
        search: operationMatch[1],
        replace: operationMatch[2]
      });
    }

    if (operations.length === 0) {
      errors.push("No valid SEARCH/REPLACE operations found");
    }

    // Validate individual operations
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      
      if (!op.search.trim()) {
        errors.push(`Empty search text in operation ${i + 1}`);
      }
      
      if (op.search.length > 5000) {
        warnings.push(`Search text is very long in operation ${i + 1} (${op.search.length} chars)`);
      }
      
      if (op.replace.length > 10000) {
        warnings.push(`Replace text is very long in operation ${i + 1} (${op.replace.length} chars)`);
      }
    }

  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Hook for applying future safe optimizations to AI responses.
 * This function is designed to be extended with additional safe optimization features.
 * @param reply - The reply to optimize.
 * @param repoPath - Path to the repository for context-aware optimizations.
 * @returns The optimized reply.
 */
function applyFutureOptimizations(reply: string, _repoPath: string): string {
  // Currently a pass-through, but provides a safe place to add:
  // - AST-based code formatting
  // - Context-aware search/replace block validation
  // - Language-specific improvements
  // - Safe pattern matching for common issues
  
  // Example: Remove obviously malformed search/replace blocks
  // This is safer than complex regex operations
  const lines = reply.split('\n');
  const cleanedLines = lines.filter(line => {
    // Remove lines that look like broken search/replace artifacts
    // but only if they're clearly malformed (safe patterns only)
    const suspiciousPatterns = [
      /^={7,}$/, // Lines with only equals signs
      /^<{7,}$/, // Lines with only less-than signs  
      /^>{7,}$/, // Lines with only greater-than signs
    ];
    
    return !suspiciousPatterns.some(pattern => pattern.test(line.trim()));
  });
  
  return cleanedLines.join('\n');
}

/**
 * Return top contributors by number of merged pull requests.
 * @param repoPath - Local path of the repository.
 * @param limit - Maximum number of contributors to return.
 */
export function getTopContributorsByMergedPRs(
  repoPath: string,
  limit: number = 5
): Array<{ name: string; count: number }> {
  logger.log("getTopContributorsByMergedPRs", { repoPath, limit });
  if (!fs.existsSync(repoPath)) {
    logger.warn("repository path does not exist", { repoPath });
    return [];
  }
  const cmd = 'git log --merges --format="%an" | sort | uniq -c | sort -nr';
  const output = execSync(cmd, { cwd: repoPath, encoding: "utf-8" }).trim();
  if (!output) return [];
  return output
    .split("\n")
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const count = parseInt(parts[0], 10);
      const name = parts.slice(1).join(" ");
      return { name, count };
    })
    .slice(0, limit);
}
