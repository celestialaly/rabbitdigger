<template>
  <v-card>
    <v-card-text class="d-flex align-center">
      <v-icon :color="color" size="36" class="mr-4">{{ icon }}</v-icon>
      <div>
        <div class="text-h5 font-weight-bold">{{ value }}</div>
        <div class="text-caption text-medium-emphasis">{{ label }}</div>
      </div>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
defineProps<{
  icon: string
  color: string
  label: string
  value: number | string
}>()
</script>
