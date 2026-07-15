import { Component, type ReactNode } from 'react';
import { AppError } from '@/pages/misc';

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

  componentDidCatch(error: unknown) {
    // Sem provedor de telemetria por ora; ao menos deixa rastro no console.
    console.error('[ROMVault] erro não tratado:', error);
  }

  render() {
    if (this.state.hasError) return <AppError />;
    return this.props.children;
  }
}
