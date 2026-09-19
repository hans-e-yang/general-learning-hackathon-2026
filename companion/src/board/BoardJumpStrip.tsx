"use client";

type Item = { id: string; label: string };

export function BoardJumpStrip(props: {
  items: Item[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <nav className="board-jump-strip" aria-label="Questions">
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={
            item.id === props.activeId
              ? "board-jump-item is-active"
              : "board-jump-item"
          }
          aria-current={item.id === props.activeId ? "true" : undefined}
          onClick={() => props.onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
