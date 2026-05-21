import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
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
    color: colors.yellowBackground,
    borderColor: colors.text.yellow,
    accentColor: colors.text.yellow,
  },
  {
    id: 'monitor',
    icon: '📈',
    title: 'Monitorizar',
    subtitle: 'Ver dados em tempo real',
    route: 'Monitoring',
    color: '#DBEAFE',
    borderColor: colors.primary,
    accentColor: colors.primary,
  },
  {
    id: 'history',
    icon: '📋',
    title: 'Histórico',
    subtitle: 'Ver sessões anteriores',
    route: 'History',
    color: '#D1FAE5',
    borderColor: colors.secondary,
    accentColor: colors.secondary,
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

      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá 👋,</Text>
          <Text style={styles.name}>{user?.name || 'Utilizador'}</Text>
        </View>
      </View>

      <View style={styles.cardsSection}>
        {cards.map((card) => (
          <TouchableOpacity
            key={card.id}
            style={[sharedStyles.card, styles.card]}
            onPress={() => navigation.navigate(card.route)}
            activeOpacity={0.82}
          >
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

      <View style={styles.resumoSection}>
        <Text style={styles.sectionTitle}>Resumo de Hoje</Text>
        <View style={styles.resumo}>
          {resumo.map((item) => (
            <View key={item.label} style={[sharedStyles.card, styles.resumoItem]}>
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

  header: {
    flex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 0,
  },
  greeting: {
    fontSize: 15,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text.primary,
    marginTop: 2,
    letterSpacing: -0.5,
  },

  cardsSection: {
    flex: 20,
    justifyContent: 'space-evenly',
    marginTop: -80,
  },
  card: {
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingVertical: 18,
    paddingRight: 16,
    paddingLeft: 0,
    borderWidth: 1,
    overflow: 'hidden',
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
    color: colors.text.primary,
  },
  cardSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    marginTop: 3,
  },
  cardArrow: {
    fontSize: 36,
    lineHeight: 36,
    marginRight: 4,
  },

  resumoSection: {
    flex: 5,
    justifyContent: 'center',
    paddingBottom: 15,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.secondary,
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
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    gap: 2,
  },
  resumoValue: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  resumoLabel: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});