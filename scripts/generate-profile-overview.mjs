import { mkdir, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_USERNAME;
if (!username) {
  throw new Error("GITHUB_USERNAME is required.");
}

const headers = {
  "User-Agent": "github-profile-overview",
  "Accept-Language": "en-US,en;q=0.9",
};

const contributionResponse = await fetch(
  `https://github.com/users/${encodeURIComponent(username)}/contributions`,
  { headers },
);
if (!contributionResponse.ok) {
  throw new Error(
    `GitHub contribution page returned HTTP ${contributionResponse.status}.`,
  );
}

const contributionHtml = await contributionResponse.text();
const headingHtml = contributionHtml.match(
  /<h2\b[^>]*id="js-contribution-activity-description"[^>]*>([\s\S]*?)<\/h2>/i,
)?.[1];
const headingText = headingHtml
  ?.replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/\s+/g, " ")
  .trim();
const contributionMatch = headingText?.match(
  /([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/i,
);
if (!contributionMatch) {
  throw new Error("Could not read the contribution total from GitHub's profile graph.");
}

const contributions = Number(contributionMatch[1].replaceAll(",", ""));
let publicRepositories = 0;
for (let page = 1; ; page += 1) {
  const repositoriesResponse = await fetch(
    `https://api.github.com/users/${encodeURIComponent(username)}/repos?type=owner&per_page=100&page=${page}`,
    {
      headers: {
        ...headers,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (!repositoriesResponse.ok) {
    throw new Error(
      `GitHub repositories API returned HTTP ${repositoriesResponse.status}.`,
    );
  }

  const repositories = await repositoriesResponse.json();
  if (!Array.isArray(repositories)) {
    throw new Error("GitHub returned an unexpected repositories response.");
  }

  publicRepositories += repositories.filter((repository) => !repository.fork).length;
  if (repositories.length < 100) break;
}

const metrics = [
  {
    label: "CONTRIBUTIONS",
    value: contributions,
    detail: "past 12 months",
  },
  {
    label: "PUBLIC REPOSITORIES",
    value: publicRepositories,
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
await writeFile("profile/overview.svg", svg.replace(/^[ \t]+$/gm, "").trim(), "utf8");
