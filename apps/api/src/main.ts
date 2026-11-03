import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  //await app.listen(process.env.PORT ?? 3001);
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Server đang chạy tại: http://localhost:${port}`);
}
bootstrap();
