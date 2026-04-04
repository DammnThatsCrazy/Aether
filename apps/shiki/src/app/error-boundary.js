import { jsx as _jsx } from "react/jsx-runtime";
import { Component } from 'react';
import { ErrorState } from '@shiki/components/system';
import { log } from '@shiki/lib/logging';
export class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        log.error('[ErrorBoundary] Caught error', { error: error.message, stack: error.stack, componentStack: info.componentStack });
        this.props.onError?.(error, info);
    }
    render() {
        if (this.state.hasError) {
            if (this.props.fallback)
                return this.props.fallback;
            return (_jsx(ErrorState, { title: "Something went wrong", message: this.state.error?.message ?? 'An unexpected error occurred', onRetry: () => this.setState({ hasError: false, error: null }) }));
        }
        return this.props.children;
    }
}
