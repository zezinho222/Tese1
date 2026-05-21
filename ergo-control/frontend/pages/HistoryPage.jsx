import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ScrollView,
} from 'react-native';
import { colors, sharedStyles } from '../utils/shared-Styles';

const recentSessions = [
  { id: 47, date: 'Hoje, 08:30', duration: '1h 12m', alerts: 3 },
  { id: 46, date: '10 Mar, 14:15', duration: '2h 03m', alerts: 11 },
  { id: 45, date: '09 Mar, 09:00', duration: '0h 35m', alerts: 6 },
];

export default function HistoryPage({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={styles.header}>
        <TouchableOpacity
          style={sharedStyles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.pageTitle}>Histórico</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <Text style={styles.sectionLabel}>Sessões Recentes</Text>

        {recentSessions.map((session) => (
          <View key={session.id} style={[sharedStyles.card, styles.sessionCard]}>
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionTitle}>Sessão #{session.id}</Text>
              <Text style={styles.sessionDate}>{session.date}</Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{session.duration}</Text>
                <Text style={styles.statLabel}>Duração</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{session.alerts}</Text>
                <Text style={styles.statLabel}>Alertas</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.detailsBtn}
              onPress={() => navigation.navigate('SessionDetail', { sessionId: session.id })}
              activeOpacity={0.7}
            >
              <Text style={styles.detailsBtnText}>Ver detalhes &gt;</Text>
            </TouchableOpacity>
          </View>
        ))}

      </ScrollView>

      <View style={styles.bottomWrap}>
        <TouchableOpacity
          style={styles.allSessionsBtn}
          onPress={() => navigation.navigate('AllSessions')}
          activeOpacity={0.85}
        >
          <Text style={styles.allSessionsBtnText}>Ver Todas as Sessões</Text>
          <Text style={styles.allSessionsArrow}>›</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },


  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 0,
  },
  backArrow: {
    fontSize: 32,
    color: colors.text.primary,
    fontWeight: '600',
    lineHeight: 32,
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 50,
  },

  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
    marginBottom: -4,
  },

  sessionCard: {
    backgroundColor: colors.white,
    padding: 16,
    borderWidth: 1,
    gap: 10,
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  sessionDate: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
  },

  statsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  statItem: {
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text.primary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
  },

  detailsBtn: {
    alignSelf: 'flex-end',
  },
  detailsBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },

  bottomWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  allSessionsBtn: {
    backgroundColor: colors.secondary,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  allSessionsBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.white,
    flex: 1,
    textAlign: 'center',
  },
  allSessionsArrow: {
    fontSize: 36,
    fontWeight: '400',
    color: colors.white,
    position: 'absolute',
    right: 16,
    lineHeight: 36,
  },
});