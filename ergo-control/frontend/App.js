import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthStack from './navigation/AuthStack';
import MainTabs from './navigation/MainTabs';
import { AuthProvider, useAuth } from './context/AuthContext';
import syncService from './syncService';
import moduleService from './moduleService';
import notificationService from './notificationService';

function RootNavigator() {
  const { user, login, token } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      try {
        const storedToken = await AsyncStorage.getItem('token');
        const userData = await AsyncStorage.getItem('user');
        if (storedToken && userData) {
          await login(JSON.parse(userData), storedToken);
        }
      } catch (e) {}
      setLoading(false);
    };
    restore();
  }, []);

  // Regista o listener de conectividade uma vez, mantendo sempre o token atual.
  useEffect(() => {
    syncService.initNetworkListener(() => token);
    return () => syncService.stopNetworkListener();
  }, [token]);

  // Tenta sincronizar logo que houver um token disponível (ex: app reaberta já com internet).
  useEffect(() => {
    if (token) syncService.trySyncAll(token);
  }, [token]);

  // Notifica sempre que a ligação ao módulo cai de forma inesperada (ex: a
  // rede Wi-Fi do módulo desliga-se, ou o próprio módulo desliga-se) —
  // registado aqui, e não no ecrã de Monitorização, para disparar mesmo que
  // não estejas nesse ecrã (o socket/monitorização continuam em segundo
  // plano no moduleService independentemente do ecrã em que estás).
  useEffect(() => {
    moduleService.addCloseListener('app', () => {
      notificationService.notifyDevice(
        'Módulo desligou-se',
        'A ligação à rede Wi-Fi do módulo foi perdida.'
      );
    });
    return () => moduleService.removeCloseListener('app');
  }, []);

  // Desliga o módulo (fecho gracioso) sempre que a app vai para segundo
  // plano — é o que acontece quando sais para as Definições trocar de
  // rede. Feito aqui, e não à espera do trySyncAll, porque nessa altura já
  // não há caminho de rede até ao módulo para o FIN chegar: a ponte
  // Wi-Fi↔UART do módulo fica "presa" a achar que ainda estás ligado e
  // nunca mais aceita a próxima ligação.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if ((state === 'background' || state === 'inactive') && !moduleService.isMonitoring()) {
        moduleService.disconnect();
      }
    });
    return () => sub.remove();
  }, []);

  if (loading) return null;

  return user ? <MainTabs /> : <AuthStack />;
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}