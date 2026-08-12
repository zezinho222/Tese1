import React from 'react';
import { SafeAreaView as ContextSafeAreaView } from 'react-native-safe-area-context';

const DEFAULT_EDGES = ['top', 'bottom', 'left', 'right'];

export default function SafeAreaView({ edges = DEFAULT_EDGES, children, ...props }) {
  return (
    <ContextSafeAreaView edges={edges} {...props}>
      {children}
    </ContextSafeAreaView>
  );
}
