import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { BottomTabBar } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, Animated, SafeAreaView, StyleSheet, Text } from 'react-native';

import { useAuth } from '@/lib/auth';
import { isStaffRole } from '@/lib/admin';
import { useFollows } from '@/lib/follows';
import { useCurrentProfile } from '@/lib/profile';
import { useNotifications } from '@/lib/notifications';
import { emitTabReselect } from '@/lib/tabReselect';
import { tabBarTranslateY } from '@/lib/tabBarScroll';
import { theme } from '@/lib/theme';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const { isLoading, session } = useAuth();
  const { isLoading: followsLoading } = useFollows();
  const { profile, isLoading: profileLoading } = useCurrentProfile();
  const { unreadCount } = useNotifications(20);

  if (isLoading || followsLoading || profileLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={theme.colors.accent} size="large" />
        <Text style={styles.text}>Checking your login...</Text>
      </SafeAreaView>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      backBehavior="history"
      tabBar={(props) => (
        <Animated.View
          style={{
            transform: [{ translateY: tabBarTranslateY }],
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
          }}
        >
          <BottomTabBar {...props} />
        </Animated.View>
      )}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
        },
        sceneStyle: {
          backgroundColor: theme.colors.background,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              emitTabReselect("home");
            }
          },
        })}
      />
      <Tabs.Screen
        name="popular"
        options={{
          title: 'All',
          tabBarIcon: ({ color }) => <TabBarIcon name="fire" color={color} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              emitTabReselect("all");
            }
          },
        })}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color }) => <TabBarIcon name="search" color={color} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              emitTabReselect("browse");
            }
          },
        })}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : String(unreadCount)) : undefined,
          tabBarIcon: ({ color }) => <TabBarIcon name="user" color={color} />,
        }}
        listeners={({ navigation }) => ({
          tabPress: () => {
            if (navigation.isFocused()) {
              emitTabReselect("profile");
            }
          },
        })}
      />
      <Tabs.Screen
        name="admin"
        options={{
          href: isStaffRole(profile?.account_role) ? undefined : null,
          title: 'Admin',
          tabBarIcon: ({ color }) => <TabBarIcon name="shield" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.lg,
    backgroundColor: theme.colors.background,
  },
  text: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSizes.md,
  },
});
