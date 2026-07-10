import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../utils/shared-Styles';
import DataPage from '../pages/DataPage';
import ModulesPage from '../pages/ModulesPage';
import ProfilePage from '../pages/ProfilePage';
import CalibratePage from '../pages/CalibratePage';
import MonitoringPage from '../pages/MonitoringPage';
import HistoryPage  from '../pages/HistoryPage';
import HistoryDetailPage from '../pages/HistoryDetailPage';
import PersonalDataPage from '../pages/PersonalDataPage';
import NotificationsPage from '../pages/NotificationsPage';
import ConnectModulePage from '../pages/ConnectModulePage';
import ScanModulesPage   from '../pages/ScanModulesPage';
import ChartFullscreenPage from '../pages/ChartFullscreenPage';


const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const tabIcon = (focusedName, unfocusedName) => ({ focused, color, size }) => (
  <Ionicons
    name={focused ? focusedName : unfocusedName}
    size={size}
    color={color}
  />
);

function Tabs() {
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
      <Tab.Screen name="Início" component={DataPage} options={{ tabBarIcon: tabIcon('home', 'home-outline') }} />
      <Tab.Screen name="Módulos" component={ModulesPage} options={{ tabBarIcon: tabIcon('pulse', 'pulse-outline') }} />
      <Tab.Screen name="Perfil" component={ProfilePage} options={{ tabBarIcon: tabIcon('person', 'person-outline') }} />
    </Tab.Navigator>
  );
}

export default function MainTabs() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={Tabs} />
      <Stack.Screen name="Calibrate" component={CalibratePage} />
      <Stack.Screen name="Monitoring" component={MonitoringPage} />
      <Stack.Screen name="History" component={HistoryPage} />
      <Stack.Screen name="HistoryDetail" component={HistoryDetailPage} />
      <Stack.Screen name="PersonalData" component={PersonalDataPage} />
      <Stack.Screen name="Notifications" component={NotificationsPage} />
      <Stack.Screen name="ConnectModule" component={ConnectModulePage} />
      <Stack.Screen name="ScanModules"   component={ScanModulesPage} />
      <Stack.Screen name="ChartFullscreen" component={ChartFullscreenPage} options={{ orientation: 'landscape', animation: 'fade' }} />
    </Stack.Navigator>
  );
}