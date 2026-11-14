import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME;

if (!token || !username) {
  throw new Error("GITHUB_TOKEN and GITHUB_USERNAME are required.");
}

const to = new Date();
const from = new Date(to);
from.setUTCFullYear(from.getUTCFullYear() - 1);

const query = `
  query ProfileOverview($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        totalContributions
        totalCommitContributions
      }
      repositories(
        ownerAffiliations: [OWNER]
        privacy: PUBLIC
        isFork: false
        first: 1
      ) {
        totalCount
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "github-profile-overview",
  },
  body: JSON.stringify({
    query,
    variables: {
      login: username,
      from: from.toISOString(),
      to: to.toISOString(),
    },
  }),
});

const result = await response.json();
if (!response.ok || result.errors?.length) {
  throw new Error(
    result.errors?.map((error) => error.message).join("; ") ||
      `GitHub GraphQL request failed with HTTP ${response.status}`,
  );
}

const user = result.data?.user;
if (!user) {
  throw new Error(`GitHub user "${username}" was not found.`);
}

const metrics = [
  {
    label: "CONTRIBUTIONS",
    value: user.contributionsCollection.totalContributions,
    detail: "past 12 months",
  },
  {
    label: "COMMITS",
    value: user.contributionsCollection.totalCommitContributions,
    detail: "past 12 months",
  },
  {
    label: "PUBLIC REPOSITORIES",
    value: user.repositories.totalCount,
    detail: "owned, excluding forks",
  },
].filter((metric) => Number(metric.value) > 0);

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const width = 570;
const height = 180;
const padding = 24;
const columnWidth = (width - padding * 2) / Math.max(metrics.length, 1);
const metricCards = metrics
  .map((metric, index) => {
    const x = padding + index * columnWidth + 6;
    const cardWidth = columnWidth - 12;
    const value = Number(metric.value).toLocaleString("en-US");
    return `
      <g>
        <rect x="${x}" y="54" width="${cardWidth}" height="104" rx="10" fill="#202334" />
        <text x="${x + 16}" y="80" fill="#73daca" font-family="Segoe UI, Arial, sans-serif" font-size="11" font-weight="700" letter-spacing="0.5">${escapeXml(metric.label)}</text>
        <text x="${x + 16}" y="121" fill="#f0f2f8" font-family="Segoe UI, Arial, sans-serif" font-size="30" font-weight="700">${escapeXml(value)}</text>
        <text x="${x + 16}" y="144" fill="#a9b1d6" font-family="Segoe UI, Arial, sans-serif" font-size="10">${escapeXml(metric.detail)}</text>
      </g>
    `;
  })
  .join("");

const emptyState =
  metrics.length === 0
    ? '<text x="285" y="111" text-anchor="middle" fill="#a9b1d6" font-family="Segoe UI, Arial, sans-serif" font-size="13">No public activity to display yet</text>'
    : "";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(username)} GitHub contributions and repositories">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="14" fill="#1a1b27" stroke="#2d334a" />
  <text x="24" y="34" fill="#7aa2f7" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="700">${escapeXml(username)}'s GitHub Overview</text>
  ${metricCards}
  ${emptyState}
</svg>
`;

await mkdir("profile", { recursive: true });
await writeFile("profile/overview.svg", svg.trimStart(), "utf8");
