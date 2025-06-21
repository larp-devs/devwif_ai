import { generateAgentPrompt } from '../agent-prompt-generator';

// Mock logger to avoid dependency issues in tests
jest.mock('@trigger.dev/sdk', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('Agent Prompt Integration', () => {
  it('should generate agent prompt that matches the expected format from the issue', () => {
    // This is a sample review content similar to what the AI would generate
    const reviewContent = `
# Code Review

## Overall Comments
- The PR is extremely large and encompasses multiple orthogonal features (config refactoring, rpc‐manager, devnet logs, self‐repair, diagnostics, etc.); please split it into smaller, feature‐focused PRs to simplify review and testing.
- In Config::load you're using a literal "~/.config/…" path which won't expand on most OSes; leverage the dirs or shellexpand crate to resolve user home directories instead of assuming tilde expansion.
- The show_devnet_logs helper and other tail-style calls shell out to tail which may not be portable or available; consider implementing file tailing in Rust (e.g., using notify or manual file reads) to avoid external dependencies.

## Individual Comments

### Comment 1
 \`src/main.rs:142\` 
+    // The RpcClient is now created after config loading and logging setup.
     let rpc_client = RpcClient::new(config.json_rpc_url.clone());

Main contains an enormous match block

Extract each subcommand handler into a separate function or module to enhance readability and maintainability.

### Comment 2
 \`src/main.rs:472\` 
-        "solana" => {
-            let Some((solana_sub_command, solana_sub_matches)) = matches.subcommand() else {
-                eprintln!("No solana subcommand provided");
+        // "solana" => { // Temporarily commented out due to clparse changes
+        //     let Some((solana_sub_command, solana_sub_matches)) = matches.subcommand() else {
+        //         eprintln!("No solana subcommand provided");

Remove large commented-out Solana block

Consider deleting or archiving this code outside of main.rs if it's no longer needed to maintain clarity.
    `;

    const result = generateAgentPrompt(reviewContent);
    
    // Verify the structure matches the expected format
    expect(result).toContain('<details>');
    expect(result).toContain('<summary>Prompt for AI Agents</summary>');
    expect(result).toContain('~~~markdown');
    expect(result).toContain('Please address the comments from this code review:');
    expect(result).toContain('## Overall Comments');
    expect(result).toContain('## Individual Comments');
    expect(result).toContain('### Comment 1');
    expect(result).toContain('### Comment 2');
    expect(result).toContain('`src/main.rs:142`');
    expect(result).toContain('`src/main.rs:472`');
    expect(result).toContain('<issue_to_address>');
    expect(result).toContain('</issue_to_address>');
    expect(result).toContain('~~~');
    expect(result).toContain('</details>');
    
    // Verify content includes the key issues
    expect(result).toContain('extremely large');
    expect(result).toContain('Config::load');
    expect(result).toContain('enormous match block');
    expect(result).toContain('Remove large commented-out Solana block');
    
    // Log the result for manual inspection
    console.log('Generated Agent Prompt:');
    console.log(result);
  });

  it('should handle empty review gracefully', () => {
    const result = generateAgentPrompt('');
    expect(result).toBe('');
  });

  it('should handle review with only mermaid content', () => {
    const reviewContent = `
# Code Review

Here's a mermaid diagram:

\`\`\`mermaid
flowchart TD
    A[Start] --> B[Process]
    B --> C[End]
\`\`\`

Create more diagrams for better visualization.
    `;

    const result = generateAgentPrompt(reviewContent);
    expect(result).toBe(''); // Should return empty since no actionable content
  });

  it('should work with minimal actionable content', () => {
    const reviewContent = `
The authentication logic should be improved for better security.
    `;

    const result = generateAgentPrompt(reviewContent);
    
    expect(result).toContain('<details>');
    expect(result).toContain('## Overall Comments');
    expect(result).toContain('authentication logic should be improved');
  });
});