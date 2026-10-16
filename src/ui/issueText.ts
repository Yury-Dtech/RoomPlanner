import type { CatalogEntry, Project } from '../data/schema';
import type { Issue } from '../scene/collisions';

/** Human-readable (Russian) description of a furniture issue. */
export function issueMessage(issue: Issue, project: Project, catalog: readonly CatalogEntry[]): string {
  const otherId = issue.otherId ?? '?';
  switch (issue.kind) {
    case 'outside-room':
      return 'Выходит за стены';
    case 'overlap': {
      const other = project.furniture.find((f) => f.id === otherId);
      const name = other && catalog.find((c) => c.id === other.catalogId)?.name;
      return name ? `Пересекается с «${name}» (${otherId})` : `Пересекается с ${otherId}`;
    }
    case 'blocks-opening': {
      const type = project.openings.find((o) => o.id === otherId)?.type;
      const what = type === 'door' ? 'дверь' : type === 'window' ? 'окно' : 'проём';
      return `Перекрывает ${what} ${otherId}`;
    }
  }
}
