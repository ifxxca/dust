import {
    AlertCircle,
    CheckCircle2,
    CloudOff,
    LoaderCircle,
    Save,
} from 'lucide-react';

export type FeedbackTone = 'info' | 'loading' | 'success' | 'warning' | 'error';

export function OperationalFeedback({
    title,
    children,
    tone = 'info',
}: {
    title: string;
    children?: React.ReactNode;
    tone?: FeedbackTone;
}) {
    const Icon = {
        info: Save,
        loading: LoaderCircle,
        success: CheckCircle2,
        warning: CloudOff,
        error: AlertCircle,
    }[tone];
    return (
        <div
            className="operational-feedback"
            data-tone={tone}
            role={tone === 'error' ? 'alert' : 'status'}
        >
            <Icon
                size={20}
                aria-hidden="true"
                className={tone === 'loading' ? 'animate-spin' : undefined}
            />
            <div className="min-w-0">
                <p className="font-semibold">{title}</p>
                {children && (
                    <div className="mt-1 text-sm leading-relaxed">
                        {children}
                    </div>
                )}
            </div>
        </div>
    );
}
