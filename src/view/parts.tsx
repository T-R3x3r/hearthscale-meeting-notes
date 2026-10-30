/**
 * Small parts the view's screens share: an icon button that names its
 * action in a tooltip, and a page in the tab with the inset and reading
 * column of Hearthscale's settings pages.
 */
import { useState, type ComponentProps, type MouseEvent, type ReactNode } from 'react';
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
  // A press hides the tip until the pointer leaves, so it never stands
  // over the menu or the panel the press opens.
  const [pressedOnce, setPressedOnce] = useState(false);
  const tip = useFloatingTips()(name, pressedOnce ? undefined : name);
  return (
    <span
      className="hs-tipwrap"
      onMouseEnter={tip.hover.onMouseEnter}
      onMouseLeave={() => {
        tip.hover.onMouseLeave();
        setPressedOnce(false);
      }}
    >
      <IconButton
        aria-label={name}
        aria-pressed={pressed}
        {...(size && { size })}
        onClick={(e) => {
          setPressedOnce(true);
          onClick(e);
        }}
      >
        <Icon name={icon} size={size ? 14 : 16} />
      </IconButton>
      {tip.tip}
    </span>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return (
    <div className="hs-scroll hs-settings-scroll notes-page">
      <main className="hs-settings-content">{children}</main>
    </div>
  );
}
