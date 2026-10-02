import JSZip from 'jszip';
import { listArchivedRuns, getArchivedRun } from './runArchive.js';

interface RunEvent {
  type: string;
  [k: string]: unknown;
}

interface ArchivedRun {
  id: string;
  topic: string;
  status: string;
  events: unknown[];
}

/** Render a readable markdown report for one archived run from its event stream. */
function renderRunMarkdown(run: ArchivedRun): string {
  const lines: string[] = [];
  lines.push(`# ${run.topic}`);
  lines.push('');
  lines.push(`- runId: ${run.id}`);
  lines.push(`- status: ${run.status}`);
  lines.push('');

  for (const raw of run.events) {
    const e = raw as RunEvent;
    if (e.type === 'agent.start') {
      lines.push(`\n## ${e.title ?? e.agent} (\`${e.agent}\`)`);
    } else if (e.type === 'agent.result') {
      if (e.summary) lines.push(`\n${e.summary}`);
    } else if (e.type === 'agent.error') {
      lines.push(`\n> ⚠️ 该步出错：${e.message}`);
    } else if (e.type === 'agent.fallback') {
      lines.push(`\n> ⚠️ 该步多次失败后已用降级结果填充（原因：${e.reason}）`);
    } else if (e.type === 'run.qa' && Array.isArray(e.issues)) {
      const issues = e.issues as { severity: string; message: string }[];
      if (issues.length) {
        lines.push(`\n## 成稿质检`);
        for (const i of issues) lines.push(`- [${i.severity}] ${i.message}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Build a ZIP of the user's archived runs. Each run becomes a folder containing
 * `run.json` (raw events + metadata) and `report.md` (a human-readable replay
 * built from the event stream). Optional `query` filters by topic substring.
 */
export async function buildRunsZip(
  userId: string,
  query?: string,
): Promise<{ buffer: Buffer; count: number }> {
  const zip = new JSZip();
  const summaries = listArchivedRuns(userId, 500, query ?? '');
  let count = 0;
  for (const s of summaries) {
    const run = getArchivedRun(s.id, userId);
    if (!run) continue;
    const folder = zip.folder(s.id) ?? zip;
    folder.file('run.json', JSON.stringify(run, null, 2));
    folder.file('report.md', renderRunMarkdown(run));
    count++;
  }
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return { buffer, count };
}
