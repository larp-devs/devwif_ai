# Agent Prompt Feature Implementation

## Overview

This implementation adds a "Prompt for AI Agents" feature to code review responses. The feature extracts actionable feedback from AI-generated code reviews and formats it into a structured prompt that users can copy-paste to other AI agents for implementation.

## Example Output

When the code review AI generates feedback like this:

```
🔥  LARP-CODE-TRACER-2001  🔥

## Overall Comments
- The PR is extremely large and encompasses multiple features; please split it into smaller PRs
- Configuration path handling is not portable across operating systems
- Error handling could be improved throughout the codebase

## Individual Comments

### Comment 1
 `src/main.rs:142` 
+    let rpc_client = RpcClient::new(config.json_rpc_url.clone());

Main contains an enormous match block

Extract each subcommand handler into a separate function or module to enhance readability.

### Comment 2
 `src/utils/local_rpc.rs:72` 
Background spawn ignores child PID for process management
```

The agent prompt feature will automatically append this section at the end:

```html
<details>
<summary>Prompt for AI Agents</summary>

~~~markdown
Please address the comments from this code review:
## Overall Comments
- The PR is extremely large and encompasses multiple features; please split it into smaller PRs
- Configuration path handling is not portable across operating systems
- Error handling could be improved throughout the codebase

## Individual Comments

### Comment 1
 `src/main.rs:142` 
+    let rpc_client = RpcClient::new(config.json_rpc_url.clone());

<issue_to_address>
Main contains an enormous match block

Extract each subcommand handler into a separate function or module to enhance readability.
</issue_to_address>

### Comment 2
 `src/utils/local_rpc.rs:72` 

<issue_to_address>
Background spawn ignores child PID for process management
</issue_to_address>

~~~
</details>
```

## How It Works

1. **Parsing**: The `parseReviewContent()` function analyzes AI-generated review content to extract:
   - Overall comments (bullet points and numbered lists)
   - Individual file-specific comments with location information
   - Issue descriptions and actionable feedback

2. **Filtering**: The parser filters out non-actionable content like:
   - Mermaid diagram instructions
   - Flowchart creation requests
   - General visualization suggestions

3. **Formatting**: The `generateAgentPrompt()` function creates a structured markdown prompt with:
   - Collapsible `<details>` section to keep UI clean
   - Overall comments section
   - Individual comments with file locations and issue descriptions
   - Proper markdown formatting for copy-paste usage

4. **Integration**: The prompt is automatically appended to both:
   - PR code review responses
   - Issue analysis responses

## Key Features

- **Minimal Changes**: The feature is purely additive - no existing functionality is modified
- **Smart Parsing**: Handles various review formats and extracts meaningful actionable content
- **Clean UI**: Uses collapsible sections to avoid cluttering the review interface
- **Copy-Paste Ready**: Generated prompts are formatted for direct use with other AI agents
- **Error Handling**: Gracefully handles edge cases like empty reviews or non-actionable content

## Files Modified

- `src/lib/agent-prompt-generator.ts` - Core functionality (NEW)
- `src/trigger/full-code-review-implementation.ts` - Integration points (MODIFIED)
- Tests in `src/lib/__tests__/agent-prompt-*.test.ts` - Comprehensive test coverage (NEW)

## Usage

The feature works automatically - no configuration required. When users run `@l r` for code reviews, the response will now include the agent prompt section if actionable feedback is found.

Users can click the "Prompt for AI Agents" section, copy the markdown content, and paste it directly to other AI agents like ChatGPT, Claude, or Copilot for implementation assistance.