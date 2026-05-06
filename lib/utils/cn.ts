import { type ClassValue, clsx } from "clsx";

export const cn = (...args: ClassValue[]): string => clsx(args);
