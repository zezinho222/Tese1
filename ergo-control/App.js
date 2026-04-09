import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import AuthStack from './frontend/navigation/AuthStack';
// import MainTabs from './navigation/MainTabs'; // ← descomenta quando tiveres as páginas principais

export default function App() {
  // TODO: ler authStore para decidir qual stack mostrar
  const isAuthenticated = false;

  return (
    <NavigationContainer>
      {isAuthenticated ? (
        // <MainTabs />
        <AuthStack />
      ) : (
        <AuthStack />
      )}
    </NavigationContainer>
  );
}