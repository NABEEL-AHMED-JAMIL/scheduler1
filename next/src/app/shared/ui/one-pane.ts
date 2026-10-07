/**
 * Review 2026-10-07 (M17): a list/detail page (.lookup-split) that sets data-pane="list|detail" shows one pane at a time
 * below 1024 px, as the task inbox does -- the list at full width, then the one opened from it with "Back to list"
 * (.inbox-back, hidden from 1024 px). In each such page's own styles, so the rule rides in its lazy chunk and not in
 * every page's first load.
 */
export const ONE_PANE_BELOW_1024 = `
  @media (max-width: 1023.98px) {
    .lookup-split[data-pane] { grid-template-columns: minmax(0, 1fr); }
    .lookup-split[data-pane=list] > .lookup-detail, .lookup-split[data-pane=detail] > .lookup-rail { display: none; }
    .lookup-split[data-pane] > .lookup-rail, .lookup-split[data-pane] .lookup-rail-list { position: static; max-height: none; }
    .lookup-split[data-pane] > .lookup-detail { border-left: 0; margin-left: 0; }
    .lookup-split .inbox-back { margin: 0.75rem 0 0 0.75rem; }
  }
`;
