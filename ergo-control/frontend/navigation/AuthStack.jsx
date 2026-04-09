import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import WelcomePage  from '../pages/auth/WelcomePage';
import LoginPage    from '../pages/auth/LoginPage';
import RegisterPage from '../pages/auth/RegisterPage';
import RecoverPage  from '../pages/auth/RecoverPage';

const Stack = createNativeStackNavigator();

export default function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome"  component={WelcomePage} />
      <Stack.Screen name="Login"    component={LoginPage} />
      <Stack.Screen name="Register" component={RegisterPage} />
      <Stack.Screen name="Recover"  component={RecoverPage} />
    </Stack.Navigator>
  );
}