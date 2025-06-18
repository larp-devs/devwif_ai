import { sanitizeMermaidDiagram } from '../ai-sanitizer';

describe('Mermaid Diagram Styling', () => {
  describe('classDef techDebt styling', () => {
    it.each([
      { type: 'flowchart TD', expectedType: 'flowchart TD' },
      { type: 'graph LR', expectedType: 'graph LR' }
    ])('should add classDef techDebt styling to $type diagrams', ({ type, expectedType }) => {
      const input = `${type}
  A["Start Node"] --> B["End Node"]`;

      const result = sanitizeMermaidDiagram(input);
      
      expect(result).toContain(expectedType);
      expect(result).toContain('A["StartNode"] --> B["EndNode"]');
      expect(result).toContain('classDef techDebt fill:#f6f6f6,stroke:#d9534f,color:#d9534f,font-family:Consolas,monospace,font-weight:bold');
    });

    it('should not add classDef techDebt styling to non-flowchart diagrams', () => {
      const input = `sequenceDiagram
  participant A as "User"
  A->>B: Message`;

      const result = sanitizeMermaidDiagram(input);
      
      expect(result).toContain('sequenceDiagram');
      expect(result).not.toContain('classDef techDebt');
    });

    it('should not duplicate classDef techDebt if it already exists', () => {
      const input = `flowchart TD
  A["Start Node"] --> B["End Node"]
  classDef techDebt fill:#f6f6f6,stroke:#d9534f,color:#d9534f,font-family:Consolas,monospace,font-weight:bold`;

      const result = sanitizeMermaidDiagram(input);
      
      expect(result).toContain('flowchart TD');
      expect(result).toContain('A["StartNode"] --> B["EndNode"]');
      
      // Should only appear once
      const matches = result.match(/classDef techDebt/g);
      expect(matches).toHaveLength(1);
    });

    it('should handle complex flowchart with existing styling', () => {
      const input = `flowchart TD
  A["Start: (Process)"] --> B{"Decision: Yes/No?"}
  B --> C["Success: Done!"]
  B --> D["Error: Failed!"]
  style A fill:#f9f,stroke:#333,stroke-width:4px`;

      const result = sanitizeMermaidDiagram(input);
      
      expect(result).toContain('flowchart TD');
      expect(result).toContain('A["StartProcess"]');
      expect(result).toContain('B["DecisionYesNo"]');
      expect(result).toContain('C["SuccessDone"]');
      expect(result).toContain('D["ErrorFailed"]');
      expect(result).toContain('style A fill:#f9f,stroke:#333,stroke-width:4px');
      expect(result).toContain('classDef techDebt fill:#f6f6f6,stroke:#d9534f,color:#d9534f,font-family:Consolas,monospace,font-weight:bold');
    });

    it('should handle different flowchart orientations', () => {
      const orientations = [
        'flowchart TD',
        'flowchart LR',
        'flowchart BT',
        'flowchart RL',
        'graph TD',
        'graph LR',
        'graph BT',
        'graph RL'
      ];

      orientations.forEach(orientation => {
        const input = `${orientation}
  A["Node"] --> B["Node"]`;

        const result = sanitizeMermaidDiagram(input);
        
        expect(result).toContain(orientation);
        expect(result).toContain('A["Node"] --> B["Node"]');
        expect(result).toContain('classDef techDebt fill:#f6f6f6,stroke:#d9534f,color:#d9534f,font-family:Consolas,monospace,font-weight:bold');
      });
    });

    it('should handle empty flowchart diagrams', () => {
      const input = `flowchart TD`;

      const result = sanitizeMermaidDiagram(input);
      
      expect(result).toContain('flowchart TD');
      expect(result).toContain('classDef techDebt fill:#f6f6f6,stroke:#d9534f,color:#d9534f,font-family:Consolas,monospace,font-weight:bold');
    });

    it('should handle flowchart with comments and preserve them', () => {
      const input = `flowchart TD
  %% This is a comment
  A["Node: (test)"] --> B["Node: test"]
  %% Another comment`;

      const result = sanitizeMermaidDiagram(input);
      
      expect(result).toContain('flowchart TD');
      expect(result).toContain('%% This is a comment');
      expect(result).toContain('%% Another comment');
      expect(result).toContain('A["Nodetest"]');
      expect(result).toContain('B["Nodetest"]');
      expect(result).toContain('classDef techDebt fill:#f6f6f6,stroke:#d9534f,color:#d9534f,font-family:Consolas,monospace,font-weight:bold');
    });
  });
});