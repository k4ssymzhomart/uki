import type { ComponentProps, MouseEvent } from "react";
import { navigate } from "./history.ts";
import type { RoutePath } from "./routes.ts";

export type LinkProps = Omit<ComponentProps<"a">, "href"> & { to: RoutePath };

/** An anchor that navigates on the client; modified clicks keep the browser's behaviour. */
export function Link({ to, onClick, ...props }: LinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handleClick} {...props} />;
}
