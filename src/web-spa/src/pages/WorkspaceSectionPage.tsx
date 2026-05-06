import React from 'react';
import { ButtonLink, Card, CodeSurface, Eyebrow, InlineGroup, MetricCard } from '../components/ui';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { WORKSPACE_SECTIONS } from '../lib/workspace';
import type { WorkspaceSection } from '../lib/workspace';

export function WorkspaceSectionPage(props: {
  sectionKey: keyof typeof WORKSPACE_SECTIONS;
}): React.JSX.Element {
  const section: WorkspaceSection = WORKSPACE_SECTIONS[props.sectionKey];
  useDocumentTitle(section.title);

  return (
    <div className="stack">
      <Card title={section.title} subtitle={section.description}>
        <Eyebrow>{section.eyebrow}</Eyebrow>
        {section.actions?.length ? (
          <InlineGroup>
            {section.actions.map((action, index) => (
              <ButtonLink
                key={`${action.label}-${action.to}`}
                variant={index === 0 ? 'primary' : 'secondary'}
                {...(action.external
                  ? {
                      href: action.to,
                      rel: 'noopener noreferrer',
                      target: '_blank',
                    }
                  : { to: action.to })}
              >
                {action.label}
              </ButtonLink>
            ))}
          </InlineGroup>
        ) : null}
      </Card>

      {section.metrics?.length ? (
        <div className="two-up-grid">
          {section.metrics.map((metric) => (
            <MetricCard key={metric.label} label={metric.label} value={metric.value}>
              {metric.detail ? <p className="muted">{metric.detail}</p> : null}
            </MetricCard>
          ))}
        </div>
      ) : null}

      <div className="two-col">
        <div className="stack">
          {section.cards?.map((card) => (
            <Card key={card.title} title={card.title} subtitle={card.body}>
              {card.items?.length ? (
                <ul className="ordered">
                  {card.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
              {card.action ? (
                <ButtonLink
                  variant="secondary"
                  {...(card.action.external
                    ? {
                        href: card.action.to,
                        rel: 'noopener noreferrer',
                        target: '_blank',
                      }
                    : { to: card.action.to })}
                >
                  {card.action.label}
                </ButtonLink>
              ) : null}
            </Card>
          ))}

          {section.table ? (
            <Card
              title={section.table.title}
              subtitle="Scaffolded content that makes the route feel concrete immediately."
            >
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      {section.table.columns.map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {section.table.rows.map((row) => (
                      <tr key={row.join('-')}>
                        {row.map((cell) => (
                          <td key={`${row[0]}-${cell}`}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="stack">
          {section.codeBlocks?.length ? (
            <Card
              title="Reference snippets"
              subtitle="Keep commands and config close to the route context."
            >
              <div className="stack">
                {section.codeBlocks.map((block) => (
                  <CodeSurface
                    key={block.title}
                    title={block.title}
                    code={block.code}
                    copyable
                    copySuccessMessage={`${block.title} copied`}
                  />
                ))}
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
