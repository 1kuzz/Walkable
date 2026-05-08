-- CreateEnum
CREATE TYPE "WalkwayType" AS ENUM ('footway', 'path', 'cycleway', 'pedestrian', 'steps', 'track', 'bridleway');

-- CreateTable
CREATE TABLE "Walkway" (
    "id" TEXT NOT NULL,
    "osmId" TEXT NOT NULL,
    "parkId" TEXT,
    "name" TEXT,
    "type" "WalkwayType" NOT NULL,
    "geometryGeoJson" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Walkway_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Walkway_osmId_key" ON "Walkway"("osmId");

-- CreateIndex
CREATE INDEX "Walkway_parkId_idx" ON "Walkway"("parkId");

-- CreateIndex
CREATE INDEX "Walkway_type_idx" ON "Walkway"("type");

-- AddForeignKey
ALTER TABLE "Walkway" ADD CONSTRAINT "Walkway_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "Park"("id") ON DELETE SET NULL ON UPDATE CASCADE;

