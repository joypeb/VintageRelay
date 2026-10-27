import { Button } from '@astryxdesign/core/Button';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';

// S0 랜딩. 실제 화면은 components/event/ 로 옮기며 구현한다.
export default function LandingPage() {
  return (
    <VStack gap={8} padding={6} minHeight="100dvh" vAlign="center">
      <VStack gap={2}>
        <Heading level={1}>Vintage Relay</Heading>
        <Text type="body" color="secondary">
          행사 현장에서 안 입는 옷을 서로 바꿔 입어요.
        </Text>
      </VStack>
      <VStack gap={3}>
        <Button label="행사 만들기" variant="primary" size="lg" width="100%" href="/events/new" />
        <Button label="입장코드로 참여하기" size="lg" width="100%" href="/join" />
      </VStack>
    </VStack>
  );
}
