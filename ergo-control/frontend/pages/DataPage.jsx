import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';
import { useAuth } from '../context/AuthContext';

const { width, height } = Dimensions.get('window');

const cards = [
  {
    id: 'calibrate',
    icon: '🎯',
    title: 'Calibrar',
    subtitle: 'Ajustar módulos sEMG e IMU',
    route: 'Calibrate',
    color: '#FFF3CD',
    borderColor: '#F59E0B',
    accentColor: '#F59E0B',
  },
  {
    id: 'monitor',
    icon: '📈',
    title: 'Monitorizar',
    subtitle: 'Ver dados em tempo real',
    route: 'Monitoring',
    color: '#DBEAFE',
    borderColor: '#3B82F6',
    accentColor: '#3B82F6',
  },
  {
    id: 'history',
    icon: '📋',
    title: 'Histórico',
    subtitle: 'Ver sessões anteriores',
    route: 'History',
    color: '#D1FAE5',
    borderColor: '#10B981',
    accentColor: '#10B981',
  },
];

const resumo = [
  { label: 'Sessões', value: '3' },
  { label: 'Alertas', value: '18' },
  { label: 'Tempo', value: '4h' },
];

export default function DataPage({ navigation }) {
  const { user } = useAuth();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header — ocupa ~18% do ecrã */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá 👋</Text>
          <Text style={styles.name}>{user?.name || 'Utilizador'}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(user?.name || 'U')[0].toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Cards — ocupam ~50% do ecrã */}
      <View style={styles.cardsSection}>
        {cards.map((card) => (
          <TouchableOpacity
            key={card.id}
            style={styles.card}
            onPress={() => navigation.navigate(card.route)}
            activeOpacity={0.82}
          >
            {/* Barra de cor lateral */}
            <View style={[styles.cardAccent, { backgroundColor: card.accentColor }]} />

            <View style={[styles.iconCircle, { backgroundColor: card.color, borderColor: card.borderColor }]}>
              <Text style={styles.iconText}>{card.icon}</Text>
            </View>

            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardSubtitle}>{card.subtitle}</Text>
            </View>

            <Text style={[styles.cardArrow, { color: card.accentColor }]}>›</Text>

          </TouchableOpacity>
        ))}
      </View>

      {/* Resumo — ocupa ~25% do ecrã */}
      <View style={styles.resumoSection}>
        <Text style={styles.sectionTitle}>Resumo de Hoje</Text>
        <View style={styles.resumo}>
          {resumo.map((item) => (
            <View key={item.label} style={styles.resumoItem}>
              <Text style={styles.resumoValue}>{item.value}</Text>
              <Text style={styles.resumoLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 20,
  },

  /* ── Header ── */
  header: {
    flex: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 0,
  },
  greeting: {
    fontSize: 15,
    color: colors.text?.secondary ?? '#6B7280',
    fontWeight: '500',
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text?.primary ?? '#111827',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#E0E7FF',
    borderWidth: 2,
    borderColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4F46E5',
  },

  /* ── Cards ── */
  cardsSection: {
    flex: 52,
    justifyContent: 'space-evenly',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white ?? '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 18,
    paddingRight: 16,
    paddingLeft: 0,
    borderWidth: 1,
    borderColor: colors.border ?? '#E5E7EB',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  cardAccent: {
    width: 5,
    alignSelf: 'stretch',
    borderRadius: 4,
    marginRight: 14,
    marginLeft: 0,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 15,
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
    fontSize: 17,
    fontWeight: '700',
    color: colors.text?.primary ?? '#111827',
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.text?.secondary ?? '#6B7280',
    marginTop: 3,
  },
  cardArrow: {
    fontSize: 36,
    fontWeight: '300',
    lineHeight: 36,
    marginRight: 4,
  },

  /* ── Resumo ── */
  resumoSection: {
    flex: 16,
    justifyContent: 'center',
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text?.secondary ?? '#6B7280',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  resumo: {
    flexDirection: 'row',
    gap: 10,
    flex: 1,
  },
  resumoItem: {
    flex: 1,
    backgroundColor: colors.white ?? '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border ?? '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 2,
  },
  resumoValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text?.primary ?? '#111827',
    letterSpacing: -0.5,
  },
  resumoLabel: {
    fontSize: 11,
    color: colors.text?.secondary ?? '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});