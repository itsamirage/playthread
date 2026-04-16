import { Animated } from "react-native";

export const TAB_BAR_HEIGHT = 80;

export const tabBarTranslateY = new Animated.Value(0);

let lastScrollY = 0;
let isHidden = false;

export function onTabBarScroll(event) {
  const currentY = event.nativeEvent.contentOffset.y;
  const delta = currentY - lastScrollY;
  lastScrollY = currentY;

  if (currentY <= 10) {
    if (isHidden) {
      isHidden = false;
      Animated.spring(tabBarTranslateY, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 14,
      }).start();
    }
    return;
  }

  if (delta > 4 && !isHidden) {
    isHidden = true;
    Animated.spring(tabBarTranslateY, {
      toValue: TAB_BAR_HEIGHT,
      useNativeDriver: true,
      bounciness: 0,
      speed: 14,
    }).start();
  } else if (delta < -4 && isHidden) {
    isHidden = false;
    Animated.spring(tabBarTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 14,
    }).start();
  }
}

export function showTabBar() {
  if (isHidden) {
    isHidden = false;
    Animated.spring(tabBarTranslateY, {
      toValue: 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 14,
    }).start();
  }
}
