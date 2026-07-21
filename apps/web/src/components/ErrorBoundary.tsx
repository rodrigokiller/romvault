import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AppError } from '@/pages/misc';
import { reportError } from '@/lib/sentry';

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/** Captura erros de renderização e mostra uma tela amigável. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ROMVault] erro não tratado:', error);
    // vai pro Sentry quando há DSN; no local não sai nada
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) return <AppError />;
    return this.props.children;
  }
}
