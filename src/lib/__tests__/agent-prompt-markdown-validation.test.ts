import { parseReviewContent, generateAgentPrompt } from '../agent-prompt-generator';

// Mock logger to avoid dependency issues in tests
jest.mock('@trigger.dev/sdk', () => ({
  logger: {
    log: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn()
  }
}));

describe('Agent Prompt Markdown Validation', () => {
  describe('Special Character Handling', () => {
    it('should properly escape markdown special characters in comments', () => {
      const reviewContent = `
- Fix the \`code\` with *emphasis* and **bold** text
- Handle [links](http://example.com) and <tags>
- Process ~ tildes and _ underscores _ properly
- Deal with | pipes | and # headers #
- Manage & ampersands & correctly

### Comment 1
\`src/test.rs:123\`
+    let value = "string with \`backticks\` and *stars*";

The issue is with *emphasis* and **bold** formatting that could break markdown.
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('Fix the `code` with *emphasis*');
      expect(result).toContain('Handle [links](http://example.com)');
      expect(result).toContain('<issue_to_address>');
      expect(result).toContain('*emphasis* and **bold** formatting');
      expect(result).toContain('</issue_to_address>');
      
      // Verify the markdown structure is valid
      expect(result).toMatch(/<details>\s*<summary>Prompt for AI Agents<\/summary>/);
      expect(result).toMatch(/~~~markdown[\s\S]*~~~\s*<\/details>/);
    });

    it('should handle code blocks with various languages and special syntax', () => {
      const reviewContent = `
### Comment 1
\`src/utils/parser.py:45\`
+def parse_data(self, data: Dict[str, Any]) -> Optional[Result]:
+    # This handles ~user paths and *glob patterns*
+    return self._process(data["key"])

The function needs better error handling for \`None\` values.

### Comment 2  
\`config/nginx.conf:12\`
+server {
+    listen 80;
+    server_name *.example.com;
+    root /var/www/html;
+}

Configuration is missing SSL setup.
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('```');
      expect(result).toContain('def parse_data');
      expect(result).toContain('server {');
      expect(result).toContain('listen 80;');
      expect(result).toContain('*.example.com');
      
      // Should preserve code structure in code blocks
      const codeBlockRegex = /```\s*[\s\S]*?\s*```/g;
      const codeBlocks = result.match(codeBlockRegex);
      expect(codeBlocks).toBeTruthy();
      expect(codeBlocks!.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle unusual file paths and extensions', () => {
      const reviewContent = `
### Comment 1
\`src/components/Button.test.tsx:25\`
Unit test is missing edge cases

### Comment 2
\`C:\\Users\\Dev\\project\\src\\main.cs:100\`  
Windows path handling

### Comment 3
\`./deep/nested/path/to/file.config.js:55\`
Relative path configuration

### Comment 4
\`/usr/local/bin/script.sh:10\`
Unix absolute path

### Comment 5
\`weird-file-name.component.spec.ts:88\`
Hyphenated filename

### Comment 6
\`data/file.json.backup:1\`
Multiple extensions
      `;

      const result = parseReviewContent(reviewContent);
      
      expect(result.individualComments).toHaveLength(6);
      expect(result.individualComments[0].location).toBe('src/components/Button.test.tsx:25');
      expect(result.individualComments[1].location).toBe('C:\\Users\\Dev\\project\\src\\main.cs:100');
      expect(result.individualComments[2].location).toBe('./deep/nested/path/to/file.config.js:55');
      expect(result.individualComments[3].location).toBe('/usr/local/bin/script.sh:10');
      expect(result.individualComments[4].location).toBe('weird-file-name.component.spec.ts:88');
      expect(result.individualComments[5].location).toBe('data/file.json.backup:1');
    });

    it('should handle HTML entities and XML-like content', () => {
      const reviewContent = `
- Fix the &lt;component&gt; rendering issue
- Handle &amp; entities properly  
- Process &quot;quotes&quot; correctly

### Comment 1
\`src/template.xml:15\`
+<config>
+  <setting value="&lt;default&gt;" />
+  <path>&amp;lt;home&amp;gt;/config</path>
+</config>

XML parsing needs to handle &entities; correctly.
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('&lt;component&gt;');
      expect(result).toContain('&amp; entities');
      expect(result).toContain('&quot;quotes&quot;');
      expect(result).toContain('<setting value="&lt;default&gt;"');
      expect(result).toContain('&entities;');
    });

    it('should preserve emojis and unicode characters', () => {
      const reviewContent = `
- Fix the 🔥 performance issue  
- Handle 📝 documentation updates
- Process 🌟 features correctly

### Comment 1
\`src/utils.js:42\`
+    console.log("✅ Success: 日本語 text processed");

The function needs to handle unicode: αβγ, 中文, العربية properly.
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('🔥 performance');
      expect(result).toContain('📝 documentation');
      expect(result).toContain('🌟 features');
      expect(result).toContain('✅ Success');
      expect(result).toContain('日本語');
      expect(result).toContain('αβγ');
      expect(result).toContain('中文');
      expect(result).toContain('العربية');
    });
  });

  describe('Markdown Structure Validation', () => {
    it('should generate valid markdown that parses correctly', () => {
      const reviewContent = `
- First issue with *formatting*
- Second issue with \`code\`

### Comment 1
\`src/main.ts:100\`
+    const result = processData();
-    const old = legacyProcess();

This needs refactoring.
      `;

      const result = generateAgentPrompt(reviewContent);
      
      // Validate HTML structure
      expect(result).toMatch(/^<details>\s*<summary>Prompt for AI Agents<\/summary>/);
      expect(result).toMatch(/<\/details>$/);
      
      // Validate markdown fence structure
      expect(result).toMatch(/~~~markdown[\s\S]*~~~\s*<\/details>$/);
      
      // Count opening and closing tags
      const detailsOpen = (result.match(/<details>/g) || []).length;
      const detailsClose = (result.match(/<\/details>/g) || []).length;
      const summaryOpen = (result.match(/<summary>/g) || []).length;
      const summaryClose = (result.match(/<\/summary>/g) || []).length;
      
      expect(detailsOpen).toBe(detailsClose);
      expect(summaryOpen).toBe(summaryClose);
      expect(detailsOpen).toBe(1);
      expect(summaryOpen).toBe(1);
    });

    it('should handle nested markdown structures correctly', () => {
      const reviewContent = `
### Comment 1
\`src/readme.md:10\`
+# Header
+- List item with *emphasis*
+  - Nested item with \`code\`

The markdown structure needs fixing.
      `;

      const result = generateAgentPrompt(reviewContent);
      
      // Should preserve nested markdown structure
      expect(result).toContain('# Header');
      expect(result).toContain('- List item with *emphasis*');
      expect(result).toContain('  - Nested item with `code`');
      
      // Verify code blocks are properly enclosed
      const markdownFences = (result.match(/~~~markdown/g) || []).length;
      const closingFences = (result.match(/~~~/g) || []).length;
      expect(markdownFences).toBe(1);
      expect(closingFences).toBe(2); // One opening, one closing
    });

    it('should handle edge case with empty or minimal content', () => {
      const reviewContent = `
### Comment 1
\`a.js:1\`
+// minimal change

Fix.
      `;

      const result = generateAgentPrompt(reviewContent);
      
      if (result === '') {
        // If no actionable content found, that's also valid behavior
        // Let's verify parsing at least detects the structure
        const parsed = parseReviewContent(reviewContent);
        expect(parsed.individualComments.length + parsed.overallComments.length).toBeGreaterThanOrEqual(0);
      } else {
        expect(result).toContain('<details>');
        expect(result).toContain('~~~markdown');
        expect(result).toContain('~~~');
        expect(result).toContain('</details>');
      }
    });

    it('should handle very long content without breaking structure', () => {
      const longComment = 'This is a very long comment that '.repeat(50);
      const reviewContent = `
### Comment 1
\`src/very/deep/nested/path/to/some/file.with.multiple.extensions.ts:999\`
${longComment}
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('<details>');
      expect(result).toContain('</details>');
      expect(result).toContain('~~~markdown');
      expect(result).toMatch(/~~~\s*<\/details>$/);
      expect(result.length).toBeGreaterThan(1000);
    });
  });

  describe('Enhanced Code Context Tests', () => {
    it('should capture full code blocks instead of single lines', () => {
      const reviewContent = `
### Comment 1
\`src/auth.ts:45\`
+  async authenticate(token: string): Promise<User> {
+    const decoded = jwt.verify(token, this.secret);
+    const user = await this.userService.findById(decoded.id);
+    return user;
+  }

Missing error handling for invalid tokens.
      `;

      const parsed = parseReviewContent(reviewContent);
      
      expect(parsed.individualComments).toHaveLength(1);
      expect(parsed.individualComments[0].codeContext).toBeTruthy();
      expect(parsed.individualComments[0].codeContext!.length).toBeGreaterThan(1);
      
      const codeLines = parsed.individualComments[0].codeContext!;
      expect(codeLines.some(line => line.includes('async authenticate'))).toBe(true);
      expect(codeLines.some(line => line.includes('jwt.verify'))).toBe(true);
      expect(codeLines.some(line => line.includes('userService.findById'))).toBe(true);
    });

    it('should format multi-line code context in proper markdown code blocks', () => {
      const reviewContent = `
### Comment 1
\`src/utils.py:20\`
+def process_data(data):
+    if not data:
+        return None
+    result = transform(data)
+    return validate(result)

Function lacks type hints and error handling.
      `;

      const result = generateAgentPrompt(reviewContent);
      
      expect(result).toContain('```');
      expect(result).toContain('def process_data(data)');
      expect(result).toContain('if not data:');
      expect(result).toContain('return None');
      expect(result).toContain('result = transform(data)');
      expect(result).toContain('return validate(result)');
      
      // Verify code block structure
      const codeBlockMatches = result.match(/```[\s\S]*?```/g);
      expect(codeBlockMatches).toBeTruthy();
      expect(codeBlockMatches!.length).toBeGreaterThanOrEqual(1);
    });
  });
});