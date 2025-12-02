import { Redirect } from 'expo-router';

export default function Index() {
  // 入口直接跳转到设备发现界面
  return <Redirect href="/remote/discovery" />;
}
