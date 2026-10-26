import type { InertiaLinkProps } from '@inertiajs/react';
import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

export function toUrl(url: NonNullable<InertiaLinkProps['href']>): string {
    return typeof url === 'string' ? url : url.url;
}

export function focusFormError(form: HTMLFormElement): void {
    requestAnimationFrame(() => {
        const target =
            form.querySelector<HTMLElement>('[aria-invalid="true"]') ??
            form.querySelector<HTMLElement>('[data-form-errors]');
        if (!target) return;
        for (
            let parent = target.parentElement;
            parent && parent !== form;
            parent = parent.parentElement
        ) {
            if (parent instanceof HTMLDetailsElement) parent.open = true;
        }
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'center' });
    });
}
