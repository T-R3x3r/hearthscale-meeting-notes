/**
 * Small parts the view's screens share: an icon button that names its
 * action in a tooltip, and a page in the tab with Hearthscale's page inset
 * and reading column.
 */
import type { ComponentProps, MouseEvent, ReactNode } from 'react';
import { Icon, IconButton, useFloatingTips } from '@hearthscale/app-ui';

export function IconAction({
  name,
  icon,
  onClick,
  pressed,
  size,
}: {
  /** The action, as the button's name and its tooltip. */
  name: string;
  icon: ComponentProps<typeof Icon>['name'];
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  pressed?: boolean;
  size?: 'sm';
}) {
  const tip = useFloatingTips()(name, name);
  return (
    <span className="hs-tipwrap" {...tip.hover}>
      <IconButton aria-label={name} aria-pressed={pressed} {...(size && { size })} onClick={onClick}>
        <Icon name={icon} size={size ? 14 : 16} />
      </IconButton>
      {tip.tip}
    </span>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="hs-scroll hs-settings-scroll notes-page">
      <main className={`hs-settings-content${className ? ` ${className}` : ''}`}>{children}</main>
    </div>
  );
}
