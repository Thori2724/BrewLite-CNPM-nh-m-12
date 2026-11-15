import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './common/app-config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Server đang chạy tại: http://localhost:${port}`);
}
bootstrap().catch(console.error);
