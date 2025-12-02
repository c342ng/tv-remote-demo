import { Stack } from 'expo-router';

export default function RemoteLayout() {
  return (
    <Stack>
      <Stack.Screen name="discovery" options={{ title: '发现设备' }} />
      <Stack.Screen name="control" options={{ title: '遥控器' }} />
    </Stack>
  );
}
