import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';

const cards = [
  {
    id: 'calibrate',
    icon: '🎯',
    title: 'Calibrar',
    subtitle: 'Ajustar módulos sEMG e IMU',
    route: 'Calibrate',
    color: '#FFF3CD',
    borderColor: '#F59E0B',
  },
  {
    id: 'monitor',
    icon: '📈',
    title: 'Monitorizar',
    subtitle: 'Ver dados em tempo real',
    route: 'Monitoring',
    color: '#DBEAFE',
    borderColor: '#3B82F6',
  },
  {
    id: 'history',
    icon: '📋',
    title: 'Histórico',
    subtitle: 'Ver sessões anteriores',
    route: 'History',
    color: '#D1FAE5',
    borderColor: '#10B981',
  },
];

const resumo = [
  { label: 'Sessões', value: '3' },
  { label: 'Alertas', value: '18' },
  { label: 'Tempo', value: '4h' },
];

export default function DataPage({ navigation }) {
  const { user } = useAuth();

  const firstName = user?.name?.split(' ')[0] || 'Utilizador';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Saudação */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Olá 👋</Text>
          <Text style={styles.name}>{user?.name || 'Utilizador'}</Text>
        </View>

        {/* Cards */}
        <View style={styles.cards}>
          {cards.map((card) => (
            <TouchableOpacity
              key={card.id}
              style={styles.card}
              onPress={() => navigation.navigate(card.route)}
              activeOpacity={0.85}
            >
              <View style={[styles.iconCircle, { backgroundColor: card.color, borderColor: card.borderColor }]}>
                <Text style={styles.iconText}>{card.icon}</Text>
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Resumo de Hoje */}
        <Text style={styles.sectionTitle}>Resumo de Hoje</Text>
        <View style={styles.resumo}>
          {resumo.map((item) => (
            <View key={item.label} style={styles.resumoItem}>
              <Text style={styles.resumoValue}>{item.value}</Text>
              <Text style={styles.resumoLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
  },
  header: {
    marginBottom: 28,
  },
  greeting: {
    fontSize: 16,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text.primary,
    marginTop: 2,
  },
  cards: {
    gap: 14,
    marginBottom: 32,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  iconText: {
    fontSize: 26,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 2,
  },
  arrow: {
    fontSize: 20,
    color: colors.text.secondary,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.secondary,
    marginBottom: 12,
  },
  resumo: {
    flexDirection: 'row',
    gap: 12,
  },
  resumoItem: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  resumoValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text.primary,
  },
  resumoLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    marginTop: 4,
    fontWeight: '500',
  },
});