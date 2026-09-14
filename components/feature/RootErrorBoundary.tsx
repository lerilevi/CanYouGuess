import { Component, ErrorInfo, ReactNode } from 'react';
import {
  CapturedCrashRecord,
  createCrashRecord,
  dismissPendingCrashRecord,
  persistCrashRecord,
} from '@/services/errorReporter';
import { CrashDiagnosticScreen } from './CrashDiagnosticScreen';

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  record: CapturedCrashRecord | null;
}

export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = { record: null };

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    return { record: createCrashRecord(error, 'render-boundary', false) };
  }

  componentDidCatch(_error: unknown, info: ErrorInfo) {
    const record = this.state.record;
    if (!record) return;
    const enriched = { ...record, details: { componentStack: info.componentStack } };
    this.setState({ record: enriched });
    void persistCrashRecord(enriched);
  }

  private dismissAndRetry = async () => {
    await dismissPendingCrashRecord();
    this.setState({ record: null });
  };

  render() {
    if (this.state.record) {
      return (
        <CrashDiagnosticScreen
          record={this.state.record}
          heading="A screen failed to render"
          dismissLabel="Dismiss report and retry"
          onDismiss={this.dismissAndRetry}
        />
      );
    }
    return this.props.children;
  }
}
