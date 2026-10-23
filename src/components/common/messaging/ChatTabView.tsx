/**
 * ChatTabView — el chat como pestaña de cualquier página de rol (carga diferida:
 * no entra en el bundle inicial de la página).
 */
import React, { Suspense } from 'react';
import ComponentErrorBoundary from '@/components/ui/ComponentErrorBoundary';

const UnifiedMessagingView = React.lazy(() => import('@/components/common/UnifiedMessagingView'));

const Loader = () => (
    <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
);

const ChatTabView: React.FC = () => (
    <ComponentErrorBoundary componentName="Messaging">
        <Suspense fallback={<Loader />}>
            <UnifiedMessagingView />
        </Suspense>
    </ComponentErrorBoundary>
);

export default ChatTabView;
