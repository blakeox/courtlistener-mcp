import React from 'react';

export function useDocumentTitle(title: string): void {
  React.useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — CourtListener MCP` : 'CourtListener MCP Portal';
    return () => {
      document.title = previous;
    };
  }, [title]);
}
