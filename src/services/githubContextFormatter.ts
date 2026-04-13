import type {
  GitHubIssueDetails,
  GitHubPullRequestDetails,
} from "../models/GitHubContext";

export function buildGitHubIssueTokenContent({
  issue,
  comments,
}: GitHubIssueDetails): string {
  let content = `Issue #${issue.number}: ${issue.title}\n`;

  if (issue.body) {
    content += `\n${issue.body}\n`;
  }

  if (comments.length > 0) {
    content += "\nComments:\n";
    for (const comment of comments) {
      content += `${comment.user.login}: ${comment.body}\n`;
    }
  }

  return content;
}

export function formatGitHubIssueBlock({
  issue,
  comments,
}: GitHubIssueDetails): string {
  let issueBlock = `<github_issue number="${issue.number}" state="${issue.state}">
<title>${issue.title}</title>
<url>${issue.html_url}</url>
<created_at>${issue.created_at}</created_at>
<author>${issue.user.login}</author>`;

  if (issue.labels.length > 0) {
    const labelNames = issue.labels.map((label) => label.name).join(", ");
    issueBlock += `\n<labels>${labelNames}</labels>`;
  }

  if (issue.body) {
    issueBlock += `\n<body>\n${issue.body}\n</body>`;
  }

  if (comments.length > 0) {
    issueBlock += "\n<comments>";
    for (const comment of comments) {
      issueBlock += `\n<comment author="${comment.user.login}" created_at="${comment.created_at}">
${comment.body}
</comment>`;
    }
    issueBlock += "\n</comments>";
  }

  issueBlock += "\n</github_issue>";
  return issueBlock;
}

export function buildGitHubPullRequestTokenContent(
  details: GitHubPullRequestDetails
): string {
  return details.diff;
}

export function formatGitHubPullRequestBlock(
  details: GitHubPullRequestDetails
): string {
  return `<github_pr number="${details.pr.number}">\n${details.diff}\n</github_pr>`;
}
