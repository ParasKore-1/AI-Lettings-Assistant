import { Check } from 'lucide-react';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';

export interface MenuItem {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  checked?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface MenuSection {
  label?: string;
  items: MenuItem[];
}

const GAP = 6;
const MARGIN = 8;

/**
 * Accessible menu button (WAI-ARIA menu pattern): arrow keys move focus,
 * Home/End jump, Escape closes and returns focus to the trigger.
 *
 * The popup is portalled and fixed-positioned from the trigger's rect, so it
 * is never clipped by scroll containers or painted under later siblings
 * (transforms create stacking contexts). It flips above the trigger when
 * there isn't room below.
 */
export function Menu({
  trigger,
  sections,
  align = 'end',
  label,
  className,
}: {
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string | undefined;
  }) => ReactNode;
  sections: MenuSection[];
  align?: 'start' | 'end';
  side?: 'top' | 'bottom';
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const items = sections.flatMap((s) => s.items);

  const enabledNodes = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])') ?? []);
  const focusItem = (index: number) => {
    const nodes = enabledNodes();
    if (nodes.length) nodes[(index + nodes.length) % nodes.length]?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    const t = triggerRef.current?.getBoundingClientRect();
    const m = menuRef.current?.getBoundingClientRect();
    if (!t || !m) return;
    const below = window.innerHeight - t.bottom;
    const top = below >= m.height + GAP + MARGIN || below > t.top ? t.bottom + GAP : t.top - GAP - m.height;
    const left =
      align === 'end'
        ? Math.max(MARGIN, t.right - m.width)
        : Math.min(t.left, window.innerWidth - m.width - MARGIN);
    setStyle({ top: Math.max(MARGIN, top), left: Math.max(MARGIN, left) });
  }, [open, align]);

  useEffect(() => {
    if (!open) {
      setStyle({ visibility: 'hidden' });
      return;
    }
    const checked = Math.max(0, items.findIndex((i) => i.checked));
    const frame = requestAnimationFrame(() => focusItem(checked));
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !triggerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onViewportChange = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const select = (item: MenuItem) => {
    if (item.disabled) return;
    close();
    item.onSelect(); // after close, so the item may move focus elsewhere (e.g. an inline editor)
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const nodes = enabledNodes();
    const current = nodes.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem(current + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(current - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(nodes.length - 1);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close();
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  // Portal into the nearest themed subtree (e.g. the playground's dark panel), else <body>.
  const themed = triggerRef.current?.closest<HTMLElement>('[data-theme]');
  const container = themed && themed !== document.documentElement ? themed : typeof document !== 'undefined' ? document.body : null;

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((o) => !o),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': open ? menuId : undefined,
      })}
      {open &&
        container &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            tabIndex={-1}
            aria-label={label}
            onKeyDown={onKeyDown}
            style={style}
            className={cn(
              'fixed z-[80] max-h-[min(70vh,32rem)] max-w-[calc(100vw-1rem)] min-w-56 animate-fade-in overflow-y-auto rounded-xl border border-border bg-elevated p-1 text-fg shadow-pop',
              className,
            )}
          >
            {sections.map((section, si) => (
              <div
                key={si}
                role="group"
                aria-label={section.label}
                className={cn(si > 0 && 'mt-1 border-t border-border pt-1')}
              >
                {section.label && <div className="px-2.5 pt-1.5 pb-1 text-xs font-medium text-fg-subtle">{section.label}</div>}
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                    aria-checked={item.checked}
                    aria-disabled={item.disabled || undefined}
                    tabIndex={-1}
                    onClick={() => select(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        select(item);
                      }
                    }}
                    className={cn(
                      'flex cursor-default items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none',
                      'hover:bg-surface-3 focus:bg-surface-3',
                      item.danger ? 'text-danger' : 'text-fg',
                      item.disabled && 'opacity-45',
                    )}
                  >
                    {item.icon && <span className="mt-0.5 text-fg-muted [&>svg]:size-4">{item.icon}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{item.label}</span>
                      {item.description && <span className="block text-xs text-fg-subtle">{item.description}</span>}
                    </span>
                    {item.checked && <Check className="mt-0.5 size-4 text-accent" aria-hidden="true" />}
                  </div>
                ))}
              </div>
            ))}
          </div>,
          container,
        )}
    </>
  );
}
