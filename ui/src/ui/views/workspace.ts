import { html, nothing } from "lit";
import type { WorkboardCard } from "../controllers/workboard.ts";
import { formatRelativeTimestamp } from "../format.ts";
import type { GatewaySessionRow, SkillStatusReport } from "../types.ts";

export type WorkspaceProps = {
  query: string;
  sessions: GatewaySessionRow[];
  sessionsLoading: boolean;
  sessionsError: string | null;
  memoryContent: string;
  memoryLoading: boolean;
  memoryError: string | null;
  dreamDiaryContent: string;
  projects: WorkboardCard[];
  projectsLoading: boolean;
  projectsError: string | null;
  skills: SkillStatusReport["skills"];
  skillsLoading: boolean;
  skillsError: string | null;
  onQueryChange: (query: string) => void;
  onOpenChat: (sessionKey: string) => void;
  onNavigate: (tab: "sessions" | "dreams" | "workboard" | "skills") => void;
  onRefresh: () => void;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function matches(query: string, values: Array<string | null | undefined>): boolean {
  const needle = normalize(query);
  return !needle || values.some((value) => normalize(value).includes(needle));
}

function sessionTitle(session: GatewaySessionRow): string {
  return (
    session.label?.trim() || session.displayName?.trim() || session.subject?.trim() || session.key
  );
}

function memoryExcerpts(content: string, query: string, limit = 8): string[] {
  const blocks = content
    .split(/\n(?=#{1,3}\s)|\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const filtered = query
    ? blocks.filter((block) => normalize(block).includes(normalize(query)))
    : blocks;
  return filtered.slice(0, limit);
}

function renderEmpty(message: string) {
  return html`<div class="daneel-workspace__empty">${message}</div>`;
}

export function renderWorkspace(props: WorkspaceProps) {
  const sessions = [...props.sessions]
    .filter((session) =>
      matches(props.query, [
        sessionTitle(session),
        session.key,
        session.surface,
        session.subject,
        session.room,
        session.model,
      ]),
    )
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    .slice(0, 10);
  const projects = [...props.projects]
    .filter((project) =>
      matches(props.query, [project.title, project.notes, project.status, ...project.labels]),
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 10);
  const skills = [...props.skills]
    .filter((skill) =>
      matches(props.query, [skill.name, skill.description, skill.source, skill.emoji]),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 12);
  const memories = memoryExcerpts(props.memoryContent, props.query);
  const activeProjects = props.projects.filter(
    (project) => !project.archivedAt && project.status !== "done",
  ).length;
  const readySkills = props.skills.filter(
    (skill) => skill.eligible && !skill.disabled && !skill.blockedByAllowlist,
  ).length;

  return html`
    <section class="daneel-workspace">
      <header class="daneel-workspace__hero">
        <div>
          <div class="daneel-workspace__eyebrow">DANEEL</div>
          <h1>Workspace</h1>
          <p>Your conversations, durable memory, active projects, and reusable capabilities.</p>
        </div>
        <button class="btn" type="button" @click=${props.onRefresh}>Refresh</button>
      </header>

      <div class="daneel-workspace__search">
        <input
          type="search"
          .value=${props.query}
          placeholder="Search chats, memories, projects, and skills"
          aria-label="Search Daneel workspace"
          @input=${(event: Event) =>
            props.onQueryChange((event.currentTarget as HTMLInputElement).value)}
        />
        ${props.query
          ? html`<button
              class="btn btn--ghost"
              type="button"
              @click=${() => props.onQueryChange("")}
            >
              Clear
            </button>`
          : nothing}
      </div>

      <div class="daneel-workspace__stats">
        <div><strong>${props.sessions.length}</strong><span>Chats</span></div>
        <div><strong>${activeProjects}</strong><span>Active projects</span></div>
        <div><strong>${readySkills}</strong><span>Ready skills</span></div>
        <div><strong>${props.memoryContent ? "Live" : "—"}</strong><span>Memory</span></div>
      </div>

      <div class="daneel-workspace__grid">
        <article class="daneel-workspace__panel">
          <div class="daneel-workspace__panel-head">
            <div>
              <h2>Chats</h2>
              <p>Recent conversations and working sessions</p>
            </div>
            <button
              type="button"
              class="btn btn--ghost"
              @click=${() => props.onNavigate("sessions")}
            >
              All chats
            </button>
          </div>
          ${props.sessionsLoading
            ? renderEmpty("Loading chats…")
            : props.sessionsError
              ? renderEmpty(props.sessionsError)
              : sessions.length === 0
                ? renderEmpty(props.query ? "No chats match this search." : "No chats yet.")
                : html`<div class="daneel-workspace__list">
                    ${sessions.map(
                      (session) => html`
                        <button
                          type="button"
                          class="daneel-workspace__row"
                          @click=${() => props.onOpenChat(session.key)}
                        >
                          <span>
                            <strong>${sessionTitle(session)}</strong>
                            <small
                              >${session.surface || session.kind} ·
                              ${session.model || "default model"}</small
                            >
                          </span>
                          <time
                            >${session.updatedAt
                              ? formatRelativeTimestamp(session.updatedAt)
                              : "—"}</time
                          >
                        </button>
                      `,
                    )}
                  </div>`}
        </article>

        <article class="daneel-workspace__panel">
          <div class="daneel-workspace__panel-head">
            <div>
              <h2>Memory</h2>
              <p>Curated facts and decisions from MEMORY.md</p>
            </div>
            <button type="button" class="btn btn--ghost" @click=${() => props.onNavigate("dreams")}>
              Memory tools
            </button>
          </div>
          ${props.memoryLoading
            ? renderEmpty("Loading memory…")
            : props.memoryError
              ? renderEmpty(props.memoryError)
              : memories.length === 0
                ? renderEmpty(
                    props.query ? "No long-term memories match this search." : "No memory content.",
                  )
                : html`<div class="daneel-workspace__memory">
                    ${memories.map((excerpt) => html`<pre>${excerpt}</pre>`)}
                  </div>`}
          ${props.dreamDiaryContent
            ? html`<div class="daneel-workspace__footnote">
                Dream Diary is available for deeper review.
              </div>`
            : nothing}
        </article>

        <article class="daneel-workspace__panel">
          <div class="daneel-workspace__panel-head">
            <div>
              <h2>Projects</h2>
              <p>Workboard items grouped as ongoing efforts</p>
            </div>
            <button
              type="button"
              class="btn btn--ghost"
              @click=${() => props.onNavigate("workboard")}
            >
              Workboard
            </button>
          </div>
          ${props.projectsLoading
            ? renderEmpty("Loading projects…")
            : props.projectsError
              ? renderEmpty(props.projectsError)
              : projects.length === 0
                ? renderEmpty(
                    props.query ? "No projects match this search." : "No project cards yet.",
                  )
                : html`<div class="daneel-workspace__cards">
                    ${projects.map(
                      (project) => html`
                        <div class="daneel-workspace__project">
                          <div>
                            <strong>${project.title}</strong>
                            <small>${project.labels.join(" · ") || "Unlabeled"}</small>
                          </div>
                          <span class="daneel-workspace__status" data-status=${project.status}>
                            ${project.status}
                          </span>
                        </div>
                      `,
                    )}
                  </div>`}
        </article>

        <article class="daneel-workspace__panel">
          <div class="daneel-workspace__panel-head">
            <div>
              <h2>Skills</h2>
              <p>Reusable procedures available to Daneel</p>
            </div>
            <button type="button" class="btn btn--ghost" @click=${() => props.onNavigate("skills")}>
              All skills
            </button>
          </div>
          ${props.skillsLoading
            ? renderEmpty("Loading skills…")
            : props.skillsError
              ? renderEmpty(props.skillsError)
              : skills.length === 0
                ? renderEmpty(
                    props.query ? "No skills match this search." : "No skills discovered.",
                  )
                : html`<div class="daneel-workspace__skill-grid">
                    ${skills.map(
                      (skill) => html`
                        <div class="daneel-workspace__skill">
                          <span>${skill.emoji || "◆"}</span>
                          <div>
                            <strong>${skill.name}</strong>
                            <small>${skill.description || "Reusable procedure"}</small>
                          </div>
                          <i class=${skill.eligible && !skill.disabled ? "is-ready" : ""}></i>
                        </div>
                      `,
                    )}
                  </div>`}
        </article>
      </div>
    </section>
  `;
}
