// Templates for GitHub issue bodies to improve maintainability

export const CRITICAL_ISSUE_TEMPLATE = (description: string, milestoneNumber: number): string => `
## 🚨 Critical Fix Required

**Description:** ${description}

## Priority
This is a **critical issue** that requires immediate attention.

## Implementation Guidance
- Assess the current state and identify the root cause
- Research best practices for addressing this type of issue
- Implement the fix with proper testing
- Document the solution for future reference

## Validation Criteria
- [ ] Issue has been thoroughly investigated
- [ ] Solution implemented and tested
- [ ] No regression issues introduced
- [ ] Documentation updated if necessary

## Related
Part of AI Development Plan Milestone #${milestoneNumber}`;

export const MISSING_COMPONENT_TEMPLATE = (description: string, milestoneNumber: number): string => `
## 📋 Missing Component

**Description:** ${description}

## Implementation Guidance
- Research existing solutions and best practices
- Design the component architecture
- Implement with proper integration
- Add comprehensive testing
- Update documentation

## Validation Criteria
- [ ] Component successfully implemented
- [ ] Integration tests passing
- [ ] Documentation complete
- [ ] Code review completed

## Related
Part of AI Development Plan Milestone #${milestoneNumber}`;

export const IMPROVEMENT_TEMPLATE = (description: string, milestoneNumber: number): string => `
## 🔧 Code Improvement

**Description:** ${description}

## Implementation Guidance
- Analyze current implementation
- Identify specific areas for improvement
- Implement incremental changes
- Ensure backward compatibility
- Add or update tests as needed

## Validation Criteria
- [ ] Current state analyzed and documented
- [ ] Improvements implemented
- [ ] Tests updated and passing
- [ ] Performance impact assessed

## Related
Part of AI Development Plan Milestone #${milestoneNumber}`;

export const FEATURE_TEMPLATE = (description: string, milestoneNumber: number): string => `
## 💡 Innovation Feature

**Description:** ${description}

## Implementation Guidance
- Research market and user needs
- Design user experience and technical architecture
- Create development roadmap
- Implement MVP version
- Gather feedback and iterate

## Validation Criteria
- [ ] Feature requirements defined
- [ ] Technical design completed
- [ ] MVP implementation finished
- [ ] User feedback collected
- [ ] Documentation and tests complete

## Related
Part of AI Development Plan Milestone #${milestoneNumber}`;

export const MILESTONE_DESCRIPTION_TEMPLATE = (
  analysis: {
    repositoryOverview: string;
    criticalFixes: string[];
    missingComponents: string[];
    requiredImprovements: string[];
    innovationIdeas: string[];
  },
  currentDate: Date
): string => `
# AI-Generated Development Plan - ${currentDate.toISOString().split('T')[0]}

## Repository Overview
${analysis.repositoryOverview}

## Critical Fixes (ASAP) 🚨
${analysis.criticalFixes.map((fix, index) => `${index + 1}. ${fix}`).join('\n')}

## Missing Components 📋
${analysis.missingComponents.map((component, index) => `${index + 1}. ${component}`).join('\n')}

## Required Improvements 🔧
${analysis.requiredImprovements.map((improvement, index) => `${index + 1}. ${improvement}`).join('\n')}

## Innovation Ideas 💡
${analysis.innovationIdeas.map((idea, index) => `${index + 1}. ${idea}`).join('\n')}

---
*This milestone was generated automatically by AI analysis. All items have been broken down into individual GitHub issues for tracking and implementation.*`;

export const COMPLETION_COMMENT_TEMPLATE = (
  milestone: any,
  createdIssues: any[],
  priorityDistribution: {
    critical: number;
    high: number;
    normal: number;
    feature: number;
  }
): string => `
## ✅ Development Plan Generated Successfully!

I've completed a comprehensive analysis of your repository and created a structured development plan.

### 📊 Plan Summary

| Type | Count | Priority Distribution |
|------|-------|-----------------------|
| **Milestones** | 1 | N/A |
| **Issues** | ${createdIssues.length} | Critical: ${priorityDistribution.critical} • High: ${priorityDistribution.high} • Normal: ${priorityDistribution.normal} • Feature: ${priorityDistribution.feature} |

### 🎯 Created Resources

**Milestone:** [${milestone.title}](${milestone.html_url})
- Due date: ${new Date(milestone.due_on).toLocaleDateString()}
- Contains the complete diagnostic report

**Issues Created:**
${createdIssues.slice(0, 10).map(issue => `- [#${issue.number}](${issue.html_url}) ${issue.title}`).join('\n')}
${createdIssues.length > 10 ? `\n...and ${createdIssues.length - 10} more issues` : ''}

### 🚀 Next Steps

1. **Review the milestone** to understand the complete analysis
2. **Prioritize critical issues** (marked with 🚨) for immediate attention
3. **Assign team members** to specific issues based on expertise
4. **Break down large issues** into smaller tasks if needed
5. **Track progress** using the milestone view

The plan is designed to be comprehensive yet actionable. Each issue includes implementation guidance and validation criteria to help your development process.

---
*Generated by @uwularpy AI Development Planning System*`;

export const INITIAL_REPLY_TEMPLATE = (): string => `
🤖 **Plan Generation Started**

I'm analyzing your repository to create a comprehensive development plan. This will include:

- 📊 Repository analysis
- 🔍 Missing components identification
- 🚨 Critical fixes needed
- 💡 Innovation opportunities
- 📋 Organized milestone with issues

This process may take a few minutes...`;