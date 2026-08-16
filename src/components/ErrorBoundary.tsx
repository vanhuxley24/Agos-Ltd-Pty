import React from 'react';
import { ErrorBoundary as ReactErrorBoundary } from 'react-error-boundary';
import { AlertCircle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetErrorBoundary }) => {
  let errorMessage = "An unexpected error occurred.";
  let isFirestoreError = false;

  try {
    if (error?.message) {
      const parsed = JSON.parse(error.message);
      if (parsed.operationType && parsed.authInfo) {
        isFirestoreError = true;
        errorMessage = `Database error during ${parsed.operationType}: ${parsed.error}`;
      }
    }
  } catch {
    errorMessage = error?.message || errorMessage;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50">
      <Card className="max-w-md w-full border-red-100 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <CardTitle className="text-red-900">Something went wrong</CardTitle>
          <CardDescription>
            {isFirestoreError ? "There was a problem communicating with the database." : "The application encountered an error."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-red-50 p-3 rounded text-xs font-mono text-red-800 break-words max-h-40 overflow-auto">
            {errorMessage}
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={resetErrorBoundary} className="w-full gap-2 bg-red-600 hover:bg-red-700">
            <RefreshCcw className="w-4 h-4" />
            Reload Application
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export const ErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <ReactErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        window.location.reload();
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
};

export default ErrorBoundary;
