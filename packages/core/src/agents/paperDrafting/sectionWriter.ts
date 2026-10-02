import { defineAgent } from '../../agent.js';
import type { DraftSection } from '../../schemas.js';

export const sectionWriter = defineAgent({
  name: 'section-writer',
  title: '章节撰写',
  stage: 'paper-drafting',
  role: 'Write full prose for each planned section, streamed live.',
  effort: 'high',
  async run({ ctx, llm, emit }) {
    if (ctx.outline.length === 0) {
      emit({
        type: 'agent.result',
        agent: 'section-writer',
        summary: 'No outline to write from.',
        data: [],
      });
      return;
    }

    const literature =
      ctx.papers.length > 0
        ? ctx.papers
            .map((p, i) => `${i + 1}. ${p.title} (${p.year ?? 'n.d.'}) — ${p.summary}`)
            .join('\n')
        : '(none)';

    const sections: DraftSection[] = [];

    for (const plan of ctx.outline) {
      emit({
        type: 'agent.output',
        agent: 'section-writer',
        delta: `\n\n## ${plan.title}\n\n`,
      });

      // A length target that follows the run's output language — an overly thin
      // section is otherwise the single most common quality failure.
      const lengthHint =
        ctx.language === 'zh'
          ? '400–700 汉字'
          : ctx.language === 'en'
            ? '300–500 English words'
            : '400–700 字（与正文语言一致）';

      const system =
        'You are an academic author writing ONE section of a research paper. Write clear, ' +
        'rigorous, publication-quality prose in Markdown (no section heading — that is added ' +
        'separately). Cover the planned bullet points. You may reference the surveyed ' +
        'literature by author/title in prose; formal citations are inserted in a later pass, ' +
        'so do not invent citation markers. Be substantive, not padded.\n\n' +
        // Quality constraints added because unconstrained generation reliably
        // produced one-paragraph sections, bullet restatement, and invented numbers.
        'HARD REQUIREMENTS:\n' +
        `- Length: aim for ${lengthHint}. A section of only a couple of sentences is a failure.\n` +
        '- Coverage: give EVERY listed bullet its own paragraph instead of merging them.\n' +
        '- Structure: open with this section\u2019s claim, then give the reasoning, the evidence ' +
        'you actually have, and the boundary/assumption behind that claim.\n' +
        '- Do NOT restate a bullet as a heading or a one-line fragment — develop it.\n' +
        '- Do NOT invent specific numbers, dataset names, or experimental results. If a ' +
        'quantity is unknown, state it qualitatively or mark it (待补充). A fabricated ' +
        'figure is worse than an explicit gap.\n' +
        '- Do NOT use Markdown headings of any level inside the body; the assembler owns ' +
        'heading hierarchy. Prose, and occasional lists, only.';

      const points = (plan.bullets ?? []).map((b) => `- ${b}`).join('\n') || '- (no bullets)';
      const user =
        `Paper topic: ${ctx.topic}\n\n` +
        `Section: ${plan.title}\n` +
        `Points to cover:\n${points}\n\n` +
        `Available literature:\n${literature}`;

      const content = await llm.generate({
        system,
        messages: [{ role: 'user', content: user }],
        effort: 'high',
        onText: (delta) => emit({ type: 'agent.output', agent: 'section-writer', delta }),
      });

      sections.push({ id: plan.id, title: plan.title, content });
    }

    ctx.draft = { title: '', abstract: '', sections, references: [] };
    ctx.log.push(`section-writer: drafted ${sections.length} sections`);
    emit({
      type: 'agent.result',
      agent: 'section-writer',
      summary: `Drafted ${sections.length} sections.`,
      data: sections,
    });
  },
});
