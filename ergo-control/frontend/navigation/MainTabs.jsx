import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../utils/shared-Styles';
import DataPage from '../pages/DataPage';
import ModulesPage from '../pages/ModulesPage';
import ProfilePage from '../pages/ProfilePage';

const Tab = createBottomTabNavigator();

const tabIcon = (focusedName, unfocusedName) => ({ focused, color, size }) => (
  <Ionicons
    name={focused ? focusedName : unfocusedName}
    size={size}
    color={color}
  />
);

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.text.secondary,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor: colors.border,
          paddingBottom: 8,
          paddingTop: 6,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tab.Screen
        name="Início"
        component={DataPage}
        options={{
          tabBarIcon: tabIcon('home', 'home-outline'),
        }}
      />
      <Tab.Screen
        name="Módulos"
        component={ModulesPage}
        options={{
          tabBarIcon: tabIcon('pulse', 'pulse-outline'),
        }}
      />
      <Tab.Screen
        name="Perfil"
        component={ProfilePage}
        options={{
          tabBarIcon: tabIcon('person', 'person-outline'),
        }}
      />
    </Tab.Navigator>
  );
}