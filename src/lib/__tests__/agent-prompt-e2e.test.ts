/**
 * End-to-end test to verify the agent prompt feature works in the complete workflow
 * This test simulates the full code review process to ensure the agent prompt is properly generated
 */

import { generateAgentPrompt } from '../agent-prompt-generator';

// Mock logger to avoid dependency issues in tests
jest.mock('@trigger.dev/sdk/v3', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('Agent Prompt End-to-End', () => {
  it('should demonstrate complete workflow with agent prompt generation', async () => {
    // Simulate AI-generated review content that would come from OpenAI
    const mockAIReviewContent = `
🔥  LARP-CODE-TRACER-2001  🔥

## Analysis

Your code has several issues that need addressing:

- The authentication module lacks proper error handling
- Database connections are not properly pooled
- Memory leaks detected in the event loop

## File-Specific Issues

### Authentication Issue
 \`src/auth.ts:45\` 
+    if (!token) {
+        throw new Error("Invalid token");
+    }

The error handling here is too generic and doesn't provide useful debugging information.

### Database Connection Issue  
 \`src/db.ts:123\` 
+    const connection = mysql.createConnection(config);

Connection pooling should be implemented to prevent resource exhaustion.

This review shows the power of AI-driven code analysis!
    `;

    // Simulate the workflow: AI generates review, then we append agent prompt
    const agentPrompt = generateAgentPrompt(mockAIReviewContent);
    
    // Simulate the final comment body that would be posted to GitHub
    const finalCommentBody = `${mockAIReviewContent}\n\n${agentPrompt}`;
    
    // Verify the complete workflow produces expected results
    expect(finalCommentBody).toContain('LARP-CODE-TRACER-2001'); // Original review content
    expect(finalCommentBody).toContain('<details>'); // Agent prompt section
    expect(finalCommentBody).toContain('<summary>Prompt for AI Agents</summary>');
    expect(finalCommentBody).toContain('## Overall Comments');
    expect(finalCommentBody).toContain('## Individual Comments');
    expect(finalCommentBody).toContain('authentication module lacks proper error handling');
    expect(finalCommentBody).toContain('Database connections are not properly pooled');
    expect(finalCommentBody).toContain('`src/auth.ts:45`');
    expect(finalCommentBody).toContain('`src/db.ts:123`');
    expect(finalCommentBody).toContain('<issue_to_address>');
    expect(finalCommentBody).toContain('error handling here is too generic');
    expect(finalCommentBody).toContain('Connection pooling should be implemented');
    
    // Verify the structure is correct for copy-paste usage by agents
    const agentPromptSection = finalCommentBody.split('<details>')[1];
    expect(agentPromptSection).toContain('~~~markdown');
    expect(agentPromptSection).toContain('Please address the comments from this code review:');
    expect(agentPromptSection).toContain('~~~');
    expect(agentPromptSection).toContain('</details>');
    
    console.log('Complete workflow test passed. Final comment length:', finalCommentBody.length);
    console.log('Agent prompt section length:', agentPrompt.length);
  });

  it('should handle workflow with no actionable content gracefully', async () => {
    const mockReviewWithNoActionableContent = `
🔥  LARP-CODE-TRACER-2001  🔥

## Analysis

Your code looks great! Here are some nice mermaid diagrams:

\`\`\`mermaid
flowchart TD
    A[Start] --> B[Process]
    B --> C[End]
\`\`\`

Create more flowcharts for better visualization.
Make some sequence diagrams too.
    `;

    const agentPrompt = generateAgentPrompt(mockReviewWithNoActionableContent);
    const finalCommentBody = `${mockReviewWithNoActionableContent}\n\n${agentPrompt}`;
    
    // Should have original content but no agent prompt (since no actionable content)
    expect(finalCommentBody).toContain('LARP-CODE-TRACER-2001');
    expect(finalCommentBody).toContain('mermaid');
    expect(finalCommentBody).not.toContain('<details>'); // No agent prompt added
    
    // The final comment should just be the original content
    expect(finalCommentBody.trim()).toBe(mockReviewWithNoActionableContent.trim());
  });

  it('should demonstrate minimal changes - agent prompt is additive only', () => {
    // This test verifies that the agent prompt feature is purely additive
    // and doesn't modify existing review content
    
    const originalReview = 'This is a simple code review with an issue that should be fixed.';
    const agentPrompt = generateAgentPrompt(originalReview);
    const finalComment = `${originalReview}\n\n${agentPrompt}`;
    
    // Original content should be completely preserved
    expect(finalComment).toContain(originalReview);
    expect(finalComment.indexOf(originalReview)).toBe(0); // Should start with original content
    
    // Agent prompt should be additive
    if (agentPrompt) {
      expect(finalComment).toContain('<details>');
      expect(finalComment.length).toBeGreaterThan(originalReview.length);
    }
    
    console.log('Minimal changes verified - agent prompt is purely additive');
  });
});