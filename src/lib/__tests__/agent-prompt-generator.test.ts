import { parseReviewContent, generateAgentPrompt, ParsedReview } from '../agent-prompt-generator';

// Mock logger to avoid dependency issues in tests
jest.mock('@trigger.dev/sdk', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('Agent Prompt Generator', () => {
  describe('parseReviewContent', () => {
    it('should handle empty or invalid input', () => {
      expect(parseReviewContent('')).toEqual({ overallComments: [], individualComments: [] });
      expect(parseReviewContent(null as any)).toEqual({ overallComments: [], individualComments: [] });
      expect(parseReviewContent(undefined as any)).toEqual({ overallComments: [], individualComments: [] });
    });

    it('should parse overall comments from bullet points', () => {
      const reviewContent = `
# Code Review

- The PR is extremely large and encompasses multiple features
- In Config::load you're using a literal "~/.config/…" path which won't expand
- The show_devnet_logs helper shells out to tail which may not be portable

Some other text here.
      `;

      const result = parseReviewContent(reviewContent);
      
      expect(result.overallComments).toHaveLength(3);
      expect(result.overallComments[0]).toContain('extremely large');
      expect(result.overallComments[1]).toContain('Config::load');
      expect(result.overallComments[2]).toContain('show_devnet_logs');
    });

    it('should parse individual comments with locations', () => {
      const reviewContent = `
## Individual Comments

### Comment 1
 \`src/main.rs:142\` 
+    // The RpcClient is now created after config loading
     let rpc_client = RpcClient::new(config.json_rpc_url.clone());

Main contains an enormous match block

### Comment 2
 \`src/utils/local_rpc.rs:72\` 
+    println!("🔗 This will download and sync");

Background spawn ignores child PID
      `;

      const result = parseReviewContent(reviewContent);
      
      expect(result.individualComments).toHaveLength(2);
      expect(result.individualComments[0].location).toBe('src/main.rs:142');
      expect(result.individualComments[0].issueToAddress).toContain('enormous match block');
      expect(result.individualComments[1].location).toBe('src/utils/local_rpc.rs:72');
      expect(result.individualComments[1].issueToAddress).toContain('Background spawn ignores');
    });

    it('should filter out mermaid-related comments', () => {
      const reviewContent = `
- Create a comprehensive mermaid diagram of the repo
- Fix the actual bug in the authentication logic
- Use flowchart TD for better visualization
- The error handling needs improvement
      `;

      const result = parseReviewContent(reviewContent);
      
      expect(result.overallComments).toHaveLength(2);
      expect(result.overallComments.some(c => c.includes('authentication logic'))).toBe(true);
      expect(result.overallComments.some(c => c.includes('error handling'))).toBe(true);
      // Should not contain mermaid-related comments
      expect(result.overallComments.some(c => c.toLowerCase().includes('mermaid'))).toBe(false);
      expect(result.overallComments.some(c => c.toLowerCase().includes('flowchart'))).toBe(false);
    });

    it('should extract actionable sentences when no structured comments found', () => {
      const reviewContent = `
This code review shows several issues. You should consider refactoring the main function. 
The authentication logic needs to be improved. I recommend using better error handling practices.
Create a nice diagram. Make some flowcharts too.
      `;

      const result = parseReviewContent(reviewContent);
      
      expect(result.overallComments.length).toBeGreaterThan(0);
      expect(result.overallComments.some(c => c.includes('should'))).toBe(true);
    });
  });

  describe('generateAgentPrompt', () => {
    it('should handle empty or invalid input', () => {
      expect(generateAgentPrompt('')).toBe('');
      expect(generateAgentPrompt(null as any)).toBe('');
      expect(generateAgentPrompt(undefined as any)).toBe('');
    });

    it('should generate proper markdown structure with overall comments', () => {
      const reviewContent = `
- The PR is extremely large and should be split into smaller PRs
- Configuration path handling is not portable across operating systems
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('<details>');
      expect(result).toContain('<summary>Prompt for AI Agents</summary>');
      expect(result).toContain('~~~markdown');
      expect(result).toContain('## Overall Comments');
      expect(result).toContain('- The PR is extremely large');
      expect(result).toContain('- Configuration path handling');
      expect(result).toContain('~~~');
      expect(result).toContain('</details>');
    });

    it('should generate proper structure with individual comments', () => {
      const reviewContent = `
### Comment 1
 \`src/main.rs:142\` 
+    let rpc_client = RpcClient::new(config.json_rpc_url.clone());

Main contains an enormous match block
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('## Individual Comments');
      expect(result).toContain('### Comment 1');
      expect(result).toContain('`src/main.rs:142`');
      expect(result).toContain('<issue_to_address>');
      expect(result).toContain('Main contains an enormous match block');
      expect(result).toContain('</issue_to_address>');
    });

    it('should generate complete structure with both overall and individual comments', () => {
      const reviewContent = `
# Code Review

- The PR is extremely large and encompasses multiple features
- Error handling could be improved throughout

## Individual Comments

### Comment 1
 \`src/main.rs:142\` 
+    let rpc_client = RpcClient::new(config.json_rpc_url.clone());

Main contains an enormous match block

### Comment 2
 \`src/utils/local_rpc.rs:72\` 
Background spawn ignores child PID
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('## Overall Comments');
      expect(result).toContain('- The PR is extremely large');
      expect(result).toContain('- Error handling could be improved');
      expect(result).toContain('## Individual Comments');
      expect(result).toContain('### Comment 1');
      expect(result).toContain('### Comment 2');
      expect(result).toContain('`src/main.rs:142`');
      expect(result).toContain('`src/utils/local_rpc.rs:72`');
    });

    it('should return empty string when no actionable content is found', () => {
      const reviewContent = `
Just some general text about the code.
Create mermaid diagrams.
Make flowcharts.
      `;

      const result = generateAgentPrompt(reviewContent);
      expect(result).toBe('');
    });

    it('should handle real-world complex review content', () => {
      const reviewContent = `
🔥  LARP-CODE-TRACER-2001  🔥

## Overall Assessment
- The PR introduces multiple orthogonal features that should be split
- Hard-coded paths won't work across different operating systems  

## Detailed Analysis

### File: src/main.rs:142
\`\`\`rust
+    // The RpcClient is now created after config loading
     let rpc_client = RpcClient::new(config.json_rpc_url.clone());
\`\`\`

**Issue**: Main contains an enormous match block that hurts readability

### File: src/utils/local_rpc.rs:72
\`\`\`rust
+    println!("🔗 This will download and sync");
\`\`\`

**Issue**: Background spawn ignores child PID for process management

This code review was sponsored by $SVMAI holders.
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('## Overall Comments');
      expect(result).toContain('## Individual Comments');
      expect(result).toContain('orthogonal features');
      expect(result).toContain('Hard-coded paths');
      expect(result).toContain('Background spawn ignores');
      // The format may not capture all issues perfectly, but should capture some actionable content
      expect(result.length).toBeGreaterThan(100);
    });
  });
});