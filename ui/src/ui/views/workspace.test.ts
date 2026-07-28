/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import { renderWorkspace, type WorkspaceProps } from "./workspace.ts";

function createProps(overrides: Partial<WorkspaceProps> = {}): WorkspaceProps {
  return {
    query: "",
    sessions: [
      {
        key: "agent:main:telegram",
        kind: "direct",
        label: "Pictures replication",
        surface: "telegram",
        updatedAt: 1000,
      },
    ],
    sessionsLoading: false,
    sessionsError: null,
    memoryContent: "# Storage\nNYC remains authoritative for Pictures.",
    memoryLoading: false,
    memoryError: null,
    dreamDiaryContent: "# Dream Diary",
    projects: [
      {
        id: "pictures",
        title: "Complete Pictures replication",
        status: "running",
        priority: "high",
        labels: ["storage"],
        position: 0,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    projectsLoading: false,
    projectsError: null,
    skills: [
      {
        name: "pictures-zfs-replication",
        description: "Safely replicate Pictures.",
        source: "workspace",
        filePath: "/skills/pictures/SKILL.md",
        baseDir: "/skills/pictures",
        skillKey: "pictures-zfs-replication",
        always: false,
        disabled: false,
        blockedByAllowlist: false,
        eligible: true,
        requirements: { bins: [], env: [], config: [], os: [] },
        missing: { bins: [], env: [], config: [], os: [] },
        configChecks: [],
        install: [],
      },
    ],
    skillsLoading: false,
    skillsError: null,
    onQueryChange: vi.fn(),
    onOpenChat: vi.fn(),
    onNavigate: vi.fn(),
    onRefresh: vi.fn(),
    ...overrides,
  };
}

describe("renderWorkspace", () => {
  it("renders Daneel-branded organizer sections without OpenClaw branding", () => {
    const container = document.createElement("div");
    render(renderWorkspace(createProps()), container);

    expect(container.textContent).toContain("DANEEL");
    expect(container.textContent).toContain("Chats");
    expect(container.textContent).toContain("Memory");
    expect(container.textContent).toContain("Projects");
    expect(container.textContent).toContain("Skills");
    expect(container.textContent).not.toContain("OpenClaw");
  });

  it("searches across all organizer collections", () => {
    const container = document.createElement("div");
    render(renderWorkspace(createProps({ query: "Pictures" })), container);

    expect(container.textContent).toContain("Pictures replication");
    expect(container.textContent).toContain("NYC remains authoritative for Pictures.");
    expect(container.textContent).toContain("Complete Pictures replication");
    expect(container.textContent).toContain("pictures-zfs-replication");
  });
});
