import { Monitor, Moon, Sun } from 'lucide-react';
import type { ReactNode } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { Kbd } from '../../components/ui/misc';
import { SHORTCUTS } from '../../hooks/useGlobalShortcuts';
import { cn, modKey } from '../../lib/utils';
import { useSettings, type FontSize, type MotionPref, type ThemePref } from '../../stores/settings';
import { useUi } from '../../stores/ui';

function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-3 p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
              value === o.value ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            <input
              type="radio"
              name={legend}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon}
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const { theme, fontSize, motion, setTheme, setFontSize, setMotion } = useSettings();
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Settings" description="Appearance preferences are saved on this device.">
      <div className="space-y-5">
        <Segmented<ThemePref>
          legend="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'System', icon: <Monitor className="size-3.5" aria-hidden="true" /> },
            { value: 'light', label: 'Light', icon: <Sun className="size-3.5" aria-hidden="true" /> },
            { value: 'dark', label: 'Dark', icon: <Moon className="size-3.5" aria-hidden="true" /> },
          ]}
        />
        <Segmented<FontSize>
          legend="Text size"
          value={fontSize}
          onChange={setFontSize}
          options={[
            { value: 'sm', label: 'Small' },
            { value: 'md', label: 'Default' },
            { value: 'lg', label: 'Large' },
          ]}
        />
        <Segmented<MotionPref>
          legend="Motion"
          value={motion}
          onChange={setMotion}
          options={[
            { value: 'system', label: 'System' },
            { value: 'reduce', label: 'Reduced' },
            { value: 'full', label: 'Full' },
          ]}
        />
      </div>
    </Dialog>
  );
}

export function ShortcutsDialog() {
  const open = useUi((s) => s.shortcutsOpen);
  const setOpen = useUi((s) => s.setShortcutsOpen);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts">
      <table className="w-full text-sm">
        <caption className="sr-only">Keyboard shortcuts</caption>
        <tbody>
          {SHORTCUTS(modKey()).map((s) => (
            <tr key={s.description} className="border-b border-border last:border-0">
              <th scope="row" className="py-2.5 pr-4 text-left font-normal text-fg-muted">
                {s.description}
              </th>
              <td className="py-2.5 text-right whitespace-nowrap">
                <span className="inline-flex gap-1">
                  {s.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Dialog>
  );
}
