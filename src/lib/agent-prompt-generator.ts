import { logger } from "@trigger.dev/sdk";

/**
 * Generates a structured prompt for AI agents based on code review content
 * This allows users to copy-paste a formatted prompt to give to other AI agents
 */

export interface ParsedComment {
  location?: string;
  codeContext?: string[];
  issueToAddress: string;
}

export interface ParsedReview {
  overallComments: string[];
  individualComments: ParsedComment[];
}

/**
 * Parse the AI-generated review content to extract structured comments
 */
export function parseReviewContent(reviewContent: string): ParsedReview {
  const overallComments: string[] = [];
  const individualComments: ParsedComment[] = [];

  if (!reviewContent || typeof reviewContent !== 'string') {
    logger.warn("Invalid review content provided to parseReviewContent");
    return { overallComments, individualComments };
  }

  // Split content into sections and analyze
  const lines = reviewContent.split('\n');
  let isInCodeBlock = false;
  let currentComment: Partial<ParsedComment> = {};
  let collectingIssue = false;
  let issueLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Track code blocks
    if (line.startsWith('```')) {
      isInCodeBlock = !isInCodeBlock;
      continue;
    }

    // Skip processing inside code blocks
    if (isInCodeBlock) {
      continue;
    }

    // Look for file/location patterns with enhanced regex for uncommon paths/extensions
    // Supports: absolute paths, relative paths, unusual extensions, nested directories, Windows paths
    const locationMatch = line.match(/^[\*\-\s]*`?([^`]+\.(ts|js|tsx|jsx|py|java|cpp|c|h|rs|go|php|rb|swift|kt|scala|sh|yaml|yml|json|md|txt|xml|css|scss|less|vue|svelte|dart|r|sql|lua|perl|haskell|clj|cljs|ml|fs|vb|cs|asm|s|S|pas|pp|inc|bat|cmd|ps1|psm1|psd1|dockerfile|makefile|cmake|gradle|sbt|toml|ini|cfg|conf|properties|lock):[0-9]+)`?/) ||
                         line.match(/^[\*\-\s]*`?((?:[a-zA-Z]:)?[\/\\]?[^`\s]+(?:[\/\\][^`\s\/\\]+)*\.[a-zA-Z0-9_.-]+:[0-9]+)`?/) ||
                         line.match(/`([^`\s]+\.[a-zA-Z0-9_.-]+:[0-9]+)`/);
    if (locationMatch) {
      // Save previous comment if exists
      if (currentComment.issueToAddress) {
        individualComments.push(currentComment as ParsedComment);
      }
      currentComment = { location: locationMatch[1] };
      collectingIssue = false;
      issueLines = [];
      continue;
    }

    // Look for general bullet points or numbered items that might be overall comments
    const overallCommentMatch = line.match(/^[\*\-]\s+(.+)$/) || line.match(/^[0-9]+\.\s+(.+)$/);
    if (overallCommentMatch && !currentComment.location) {
      const comment = overallCommentMatch[1];
      // Filter out mermaid-related comments and technical instructions
      if (!comment.toLowerCase().includes('mermaid') && 
          !comment.toLowerCase().includes('diagram') &&
          !comment.toLowerCase().includes('flowchart') &&
          comment.length > 10) {
        overallComments.push(comment);
      }
      continue;
    }

    // Look for code context (lines with + or -, collect multiple lines for richer context)
    if (currentComment.location && !currentComment.codeContext && (line.includes('+') || line.includes('-'))) {
      // Start collecting code context as an array
      currentComment.codeContext = [line];
      // Look ahead for additional context lines
      let j = i + 1;
      while (j < lines.length && j < i + 10) { // Limit to prevent infinite loop
        const nextLine = lines[j];
        // Continue collecting if it's code context (diff lines, indented code, etc.)
        if (nextLine.includes('+') || nextLine.includes('-') || 
            nextLine.startsWith('  ') || nextLine.startsWith('\t') ||
            nextLine.match(/^\s*[a-zA-Z_${}()[\];.,]/)) {
          currentComment.codeContext.push(nextLine);
          j++;
        } else if (nextLine.trim() === '') {
          // Skip empty lines but continue
          j++;
        } else {
          // Hit non-code content, stop collecting
          break;
        }
      }
      continue;
    }

    // After we have location (and possibly code context), collect the issue description
    if (currentComment.location && !collectingIssue && !currentComment.issueToAddress) {
      // Skip empty lines, headers, and decorative lines
      if (line.length > 10 && 
          !line.match(/^[#\*\-=_\s]*$/) && 
          !line.includes('```') &&
          !line.startsWith('+') &&
          !line.startsWith('-') &&
          !line.startsWith('`')) {
        collectingIssue = true;
        issueLines.push(line);
      }
    } else if (collectingIssue && line.length > 5) {
      // Continue collecting until we hit another section or empty line
      if (line.match(/^#{1,6}\s/) || line.match(/^[\*\-]\s/) || line.match(/^[0-9]+\.\s/)) {
        // Stop collecting, we've hit another section
        currentComment.issueToAddress = issueLines.join(' ').trim();
        collectingIssue = false;
        issueLines = [];
        // Process this line again (don't continue)
        i--;
      } else if (line.trim() === '') {
        // Empty line might end the issue description
        if (issueLines.length > 0) {
          currentComment.issueToAddress = issueLines.join(' ').trim();
          collectingIssue = false;
          issueLines = [];
        }
      } else {
        issueLines.push(line);
      }
    }
  }

  // Don't forget the last comment
  if (collectingIssue && issueLines.length > 0) {
    currentComment.issueToAddress = issueLines.join(' ').trim();
  }
  if (currentComment.issueToAddress) {
    individualComments.push(currentComment as ParsedComment);
  }

  // If no structured comments found, try to extract from the content more broadly
  if (overallComments.length === 0 && individualComments.length === 0) {
    // Extract key sentences that look like actionable feedback
    const sentences = reviewContent.split(/[.!?]+/).filter(s => s.trim().length > 30);
    for (const sentence of sentences.slice(0, 5)) { // Limit to first 5 sentences
      const cleaned = sentence.trim();
      if (cleaned.length > 20 && 
          !cleaned.toLowerCase().includes('mermaid') &&
          !cleaned.toLowerCase().includes('diagram') &&
          (cleaned.includes('should') || cleaned.includes('consider') || cleaned.includes('recommend') || 
           cleaned.includes('fix') || cleaned.includes('improve') || cleaned.includes('issue'))) {
        overallComments.push(cleaned);
      }
    }
  }

  logger.log("Parsed review content", {
    overallCommentsCount: overallComments.length,
    individualCommentsCount: individualComments.length
  });

  return { overallComments, individualComments };
}

/**
 * Generate a formatted agent prompt from parsed review data
 */
export function generateAgentPrompt(reviewContent: string): string {
  if (!reviewContent || typeof reviewContent !== 'string') {
    logger.warn("Invalid review content provided to generateAgentPrompt");
    return '';
  }

  const parsed = parseReviewContent(reviewContent);
  
  // If no meaningful content was parsed, return empty string
  if (parsed.overallComments.length === 0 && parsed.individualComments.length === 0) {
    logger.info("No actionable comments found in review content");
    return '';
  }

  let prompt = `<details>\n<summary>Prompt for AI Agents</summary>\n\n~~~markdown\nPlease address the comments from this code review:\n`;

  // Add overall comments section
  if (parsed.overallComments.length > 0) {
    prompt += `## Overall Comments\n`;
    parsed.overallComments.forEach(comment => {
      prompt += `- ${comment}\n`;
    });
    prompt += `\n`;
  }

  // Add individual comments section
  if (parsed.individualComments.length > 0) {
    prompt += `## Individual Comments\n\n`;
    parsed.individualComments.forEach((comment, index) => {
      prompt += `### Comment ${index + 1}\n`;
      
      if (comment.location) {
        prompt += ` \`${comment.location}\` \n`;
      }
      
      if (comment.codeContext && comment.codeContext.length > 0) {
        prompt += `\`\`\`\n${comment.codeContext.join('\n')}\n\`\`\`\n\n`;
      }
      
      prompt += `<issue_to_address>\n${comment.issueToAddress}\n</issue_to_address>\n\n`;
    });
  }

  prompt += `~~~\n</details>`;

  logger.log("Generated agent prompt", {
    promptLength: prompt.length,
    hasOverallComments: parsed.overallComments.length > 0,
    hasIndividualComments: parsed.individualComments.length > 0
  });

  return prompt;
}