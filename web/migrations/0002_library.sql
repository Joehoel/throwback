CREATE TABLE "library" (
  "singleton" INTEGER NOT NULL PRIMARY KEY CHECK ("singleton" = 1),
  "id" TEXT NOT NULL UNIQUE,
  "curatorProviderId" TEXT NOT NULL CHECK ("curatorProviderId" = 'microsoft'),
  "curatorProviderAccountId" TEXT NOT NULL,
  "driveId" TEXT NOT NULL,
  "rootDriveItemId" TEXT NOT NULL,
  "rootName" TEXT NOT NULL,
  "rootPath" TEXT NOT NULL,
  "selectedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("curatorProviderId", "curatorProviderAccountId")
    REFERENCES "curator_owner" ("providerId", "providerAccountId") ON DELETE CASCADE,
  UNIQUE ("driveId", "rootDriveItemId")
);
