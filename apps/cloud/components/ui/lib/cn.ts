import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-xl',
            'display-lg',
            'display-md',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'body-lg',
            'body',
            'body-sm',
            'kicker',
            'micro',
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
